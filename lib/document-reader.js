// Browser-only document processing. The original file is not uploaded or persisted.
import { extractBillFields } from './document-import.mjs';
import { needsOcrRetry, preferOcrText, ocrReadingsDisagree } from './ocr-quality.mjs';
import { appError } from './friendly-error.mjs';

// onProgress riceve {key, params}: chiavi del dizionario («ocr.*»), tradotte da chi le mostra.

const MAX_FILE_BYTES=15*1024*1024;
const MAX_PAGES=8;
const OCR_PAGES=5;
const ACCEPTED_IMAGES=new Set(['image/jpeg','image/png','image/webp']);

async function createOcrWorker(onProgress) {
  onProgress({key:'ocr.prepare'});
  const {createWorker}=await import('tesseract.js');
  // File serviti dall'app stessa (copiati da scripts/copy-pdf-worker.mjs): niente CDN esterni.
  return createWorker(['ita','eng'], 1, {workerPath:'/ocr/worker.min.js',corePath:'/ocr/core',langPath:'/ocr/lang',workerBlobURL:false,logger: m=>{
    if(m.status==='recognizing text' && m.progress>0)onProgress({key:'ocr.recognizing',params:{percent:Math.round(m.progress*100)}});
  }});
}
// Testo di una pagina PDF (lib/pdf-text.mjs, lo stesso delle email): esportato anche da qui per le prove.
import { pageText } from './pdf-text.mjs';
export { pageText };
// Rilegge come immagine le pagine indicate e aggiunge il testo trovato; si ferma appena bastano i dati.
async function ocrPdfPages(pdf,candidatePages,text,onProgress,planMode){
  const worker=await createOcrWorker(onProgress);
  try {
    for(const candidate of candidatePages){
      onProgress({key:'ocr.scanningPage',params:{page:candidate.page}});
      const page=await pdf.getPage(candidate.page);
      try{
        const viewport=page.getViewport({scale:1.7});
        const scale=Math.min(1,2200/Math.max(viewport.width,viewport.height));
        const view=scale===1?viewport:page.getViewport({scale:1.7*scale});
        const canvas=document.createElement('canvas');
        canvas.width=Math.ceil(view.width);canvas.height=Math.ceil(view.height);
        const ctx=canvas.getContext('2d');
        if(!ctx)throw appError('ocr.scanUnsupported');
        try{
          await page.render({canvasContext:ctx,viewport:view,canvas}).promise;
          const r=await worker.recognize(canvas);
          text+='\n'+r.data.text;
        }finally{canvas.width=0;canvas.height=0;}
      }finally{page.cleanup();}
      if(!planMode&&!needsOcrRetry(text,100))break;
    }
    return text;
  }finally{await worker.terminate();}
}

async function readPdf(file, onProgress,planMode=false){
  onProgress({key:'ocr.readingPdf'});
  const pdfjs=await import('pdfjs-dist');
  pdfjs.GlobalWorkerOptions.workerSrc='/pdf.worker.min.mjs';
  const buffer=new Uint8Array(await file.arrayBuffer());
  if(new TextDecoder('ascii').decode(buffer.slice(0,5))!=='%PDF-')throw appError('ocr.notPdf');
  const loading=pdfjs.getDocument({data:buffer,isEvalSupported:false});
  const pdf=await loading.promise;
  try {
    const pages=Math.min(pdf.numPages,MAX_PAGES), extracted=[];
    for(let n=1;n<=pages;n++){
      onProgress({key:'ocr.readingPage',params:{page:n,pages}});
      const page=await pdf.getPage(n);
      const content=await page.getTextContent();
      extracted.push(pageText(content.items));
      page.cleanup();
    }
    let text=extracted.join('\n');
    // L'OCR serve solo alle pagine scansionate o a un testo illeggibile: una ricevuta o uno scontrino
    // in PDF non hanno una scadenza, ma rileggerli come immagine non aggiungerebbe nulla.
    const thin=extracted.some(s=>s.replace(/\s/g,'').length<40);
    const unreadable=(text.match(/\p{L}{3,}/gu)||[]).length<8;
    if((needsOcrRetry(text,100)&&(thin||unreadable))||(planMode&&thin)){
      // Mixed PDFs can contain real text and scanned image-only pages.
      // Prioritise pages with little selectable text and stop when key fields are found.
      const candidatePages=extracted.map((content,i)=>({page:i+1,length:content.replace(/\s/g,'').length}))
        .sort((a,b)=>a.length-b.length).slice(0,OCR_PAGES);
      // L'OCR è un aiuto in più: se non parte, vale il testo già letto dal PDF.
      try{text=await ocrPdfPages(pdf,candidatePages,text,onProgress,planMode);}
      catch(error){if(!text.replace(/\s/g,''))throw error;}
    }
    return {text,partial:pdf.numPages>MAX_PAGES};
  }finally{await loading.destroy();}
}

// Media locale dell'immagine (circa 1/16 della misura), riportata alla misura piena; null se il
// browser non lo permette (allora si usa il bianco, come prima).
function estimateBackground(canvas){
  try{
    let current=canvas;
    for(let step=0;step<4&&current.width>8&&current.height>8;step++){
      const half=document.createElement('canvas');
      half.width=Math.max(1,Math.round(current.width/2));half.height=Math.max(1,Math.round(current.height/2));
      const h=half.getContext('2d');h.imageSmoothingEnabled=true;h.drawImage(current,0,0,half.width,half.height);
      if(current!==canvas){current.width=0;current.height=0;}
      current=half;
    }
    const full=document.createElement('canvas');full.width=canvas.width;full.height=canvas.height;
    const f=full.getContext('2d',{willReadFrequently:true});f.imageSmoothingEnabled=true;f.drawImage(current,0,0,full.width,full.height);
    const data=f.getImageData(0,0,full.width,full.height).data;
    current.width=0;current.height=0;full.width=0;full.height=0;
    return data;
  }catch{return null;}
}
async function preprocessImage(file){
  // All image handling is local to the browser. Mild grayscale/contrast boosts
  // faded screenshots; keep the original OCR output if it extracts more fields.
  const bitmap=await createImageBitmap(file);
  try{
    const factor=Math.min(2,2400/Math.max(bitmap.width,bitmap.height));
    const canvas=document.createElement('canvas');
    canvas.width=Math.max(1,Math.round(bitmap.width*factor));
    canvas.height=Math.max(1,Math.round(bitmap.height*factor));
    const ctx=canvas.getContext('2d',{willReadFrequently:true});
    if(!ctx)throw appError('ocr.scanUnsupported');
    ctx.fillStyle='#fff';ctx.fillRect(0,0,canvas.width,canvas.height);
    ctx.drawImage(bitmap,0,0,canvas.width,canvas.height);
    // Sfondo uniforme: nelle foto con un'ombra (mano, telefono, luce di lato) la lettura vedeva solo
    // la parte chiara del foglio e non trovava importo né scadenza (tests/bollette-foto.test.mjs).
    // Lo sfondo si stima rimpicciolendo l'immagine a metà più volte (ogni passo fa la media di 2×2
    // pixel, così il testo sparisce) e riportandola alla misura; poi ogni pixel si divide per lo sfondo.
    const background=estimateBackground(canvas);
    const pixels=ctx.getImageData(0,0,canvas.width,canvas.height);
    for(let i=0;i<pixels.data.length;i+=4){
      const v=0.299*pixels.data[i]+0.587*pixels.data[i+1]+0.114*pixels.data[i+2];
      const b=background?0.299*background[i]+0.587*background[i+1]+0.114*background[i+2]:255;
      const flat=Math.min(255,v/Math.max(b,1)*235);
      const contrast=Math.max(0,Math.min(255,(flat-128)*1.28+128));
      pixels.data[i]=pixels.data[i+1]=pixels.data[i+2]=contrast;
    }
    ctx.putImageData(pixels,0,0);
    return canvas;
  }finally{bitmap.close();}
}

async function readImage(file,onProgress){
  const worker=await createOcrWorker(onProgress);
  try{
    onProgress({key:'ocr.photo'});
    const first=await worker.recognize(file);
    let selected={text:first.data.text,confidence:first.data.confidence},disagree=false;
    if(needsOcrRetry(selected.text,selected.confidence)){
      try{
        onProgress({key:'ocr.retry'});
        const canvas=await preprocessImage(file);
        try{
          const retry=await worker.recognize(canvas);
          const second={text:retry.data.text,confidence:retry.data.confidence};
          disagree=ocrReadingsDisagree(selected,second);
          selected=preferOcrText(selected,second);
        }finally{canvas.width=0;canvas.height=0;}
      }catch{ /* Still use the original OCR result on unsupported browsers. */ }
    }
    // Foto molto piccola (lato lungo sotto i 1000 pixel, per esempio una miniatura o un'immagine
    // ricompressa): le cifre si confondono (6 e 8, 5 e 3) anche quando la lettura sembra sicura,
    // quindi si avvisa sempre di ricontrollare (scripts/prove-foto.mjs).
    let small=false;
    try{const bitmap=await createImageBitmap(file);small=Math.max(bitmap.width,bitmap.height)<1000;bitmap.close();}catch{}
    return {text:selected.text,partial:false,ocrConfidence:selected.confidence,ocrDisagree:disagree||small};
  }finally{await worker.terminate();}
}

export async function readBillDocument(file,onProgress=()=>{}) {
  if(!file || !file.size)throw appError('ocr.emptyFile');
  if(file.size>MAX_FILE_BYTES)throw appError('ocr.tooLarge');
  const extension=(file.name.split('.').pop()||'').toLowerCase();
  const isPdf=file.type==='application/pdf'||(extension==='pdf' && !file.type);
  const isImage=ACCEPTED_IMAGES.has(file.type)||(!file.type && ['jpg','jpeg','png','webp'].includes(extension));
  if(!isPdf&&!isImage)throw appError('ocr.unsupported');
  const {text,partial,ocrConfidence,ocrDisagree}=isPdf?await readPdf(file,onProgress):await readImage(file,onProgress);
  const details=extractBillFields(text);
  // Il testo letto resta nel browser: serve all'acquisizione unica per proporre la destinazione.
  details.text=String(text||'').slice(0,20000);
  if(partial)details.warnings.unshift('import.pdfTruncated');
  // Lettura poco chiara, o due letture della foto con importo o scadenza diversi: si avvisa.
  if((Number.isFinite(ocrConfidence)&&ocrConfidence<45)||ocrDisagree)details.warnings.unshift('import.warn.lowConfidence');
  onProgress({key:'ocr.ready'});
  return details;
}

// L'impronta del file è in lib/document-upload.mjs (la usa anche l'archivio): qui resta per chi la importa da qui.
export { documentFingerprint } from './document-upload.mjs';

// Reading rate plans is also local-only. No source PDF/image is uploaded.
export async function readRatePlanDocument(file,onProgress=()=>{}){
  if(!file||!file.size)throw appError('ocr.emptyFile');
  if(file.size>MAX_FILE_BYTES)throw appError('ocr.tooLarge');
  const ext=(file.name.split('.').pop()||'').toLowerCase();
  const pdf=file.type==='application/pdf'||ext==='pdf';
  if(!pdf&&!ACCEPTED_IMAGES.has(file.type)&&!['jpg','jpeg','png','webp'].includes(ext))throw appError('ocr.unsupported');
  const data=pdf?await readPdf(file,onProgress,true):await readImage(file,onProgress);
  return {text:data.text,partial:data.partial,ocrConfidence:data.ocrConfidence};
}
