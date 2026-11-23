// Titolo proposto per una bolletta letta da un documento, nella lingua di chi la vede.
// A parte da document-import.mjs, che si scarica solo quando si importa davvero qualcosa.
export function billTitle(t,{category='Altro',supplier=''}={}){
  if(category&&category!=='Altro')return t('billTitle.'+category)+(supplier?` · ${supplier}`:'');
  return supplier?`${t('billTitle.Altro')} · ${supplier}`:t('billTitle.fromDocument');
}
