// Browser-only document processing. The original file is not uploaded or persisted.
import { extractBillFields } from './document-import.mjs';
import { needsOcrRetry, preferOcrText } from './ocr-quality.mjs';
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
function pageText(items){
  let prevY=null,prevEnd=null,result='';
  for(const item of items){
    if(typeof item.str!=='string')continue;
    const x=item.transform?.[4],y=item.transform?.[5];
    if(prevY!==null && (Math.abs(y-prevY)>3 || item.hasEOL))result+='\n';
    else if(result && !result.endsWith('\n') && prevEnd!==null && x > prevEnd+1)result+=' ';
    result+=item.str;
    prevY=y;prevEnd=Number.isFinite(x)?x+(item.width||0):null;
    if(item.hasEOL){result+='\n';prevY=null;prevEnd=null;}
  }
  return result;
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
    if(needsOcrRetry(text,100)||(planMode&&extracted.some(s=>s.replace(/\s/g,'').length<40))){
      // Mixed PDFs can contain real text and scanned image-only pages.
      // Prioritise pages with little selectable text and stop when key fields are found.
      const candidatePages=extracted.map((content,i)=>({page:i+1,length:content.replace(/\s/g,'').length}))
        .sort((a,b)=>a.length-b.length).slice(0,OCR_PAGES);
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
      }finally{await worker.terminate();}
    }
    return {text,partial:pdf.numPages>MAX_PAGES};
  }finally{await pdf.destroy();}
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
    const pixels=ctx.getImageData(0,0,canvas.width,canvas.height);
    for(let i=0;i<pixels.data.length;i+=4){
      const v=0.299*pixels.data[i]+0.587*pixels.data[i+1]+0.114*pixels.data[i+2];
      const contrast=Math.max(0,Math.min(255,(v-128)*1.28+128));
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
    let selected={text:first.data.text,confidence:first.data.confidence};
    if(needsOcrRetry(selected.text,selected.confidence)){
      try{
        onProgress({key:'ocr.retry'});
        const canvas=await preprocessImage(file);
        try{
          const retry=await worker.recognize(canvas);
          selected=preferOcrText(selected,{text:retry.data.text,confidence:retry.data.confidence});
        }finally{canvas.width=0;canvas.height=0;}
      }catch{ /* Still use the original OCR result on unsupported browsers. */ }
    }
    return {text:selected.text,partial:false,ocrConfidence:selected.confidence};
  }finally{await worker.terminate();}
}

export async function readBillDocument(file,onProgress=()=>{}) {
  if(!file || !file.size)throw appError('ocr.emptyFile');
  if(file.size>MAX_FILE_BYTES)throw appError('ocr.tooLarge');
  const extension=(file.name.split('.').pop()||'').toLowerCase();
  const isPdf=file.type==='application/pdf'||(extension==='pdf' && !file.type);
  const isImage=ACCEPTED_IMAGES.has(file.type)||(!file.type && ['jpg','jpeg','png','webp'].includes(extension));
  if(!isPdf&&!isImage)throw appError('ocr.unsupported');
  const {text,partial,ocrConfidence}=isPdf?await readPdf(file,onProgress):await readImage(file,onProgress);
  const details=extractBillFields(text);
  if(partial)details.warnings.unshift('import.pdfTruncated');
  if(Number.isFinite(ocrConfidence)&&ocrConfidence<45)details.warnings.unshift('import.warn.lowConfidence');
  onProgress({key:'ocr.ready'});
  return details;
}

export async function documentFingerprint(file){
  const buffer=await file.arrayBuffer();
  const digest=await crypto.subtle.digest('SHA-256',buffer);
  return Array.from(new Uint8Array(digest)).map(b=>b.toString(16).padStart(2,'0')).join('');
}

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
