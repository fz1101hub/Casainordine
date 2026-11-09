// User-facing errors for V20 data operations. Never expose raw database/provider errors.
const COPY={
 it:'Operazione non riuscita. Riprova; se il problema persiste, contatta l’assistenza.',
 en:'The operation failed. Try again; if the problem persists, contact support.',
 es:'No se pudo completar la operación. Inténtalo de nuevo; si el problema continúa, contacta con soporte.',
 fr:'L’opération a échoué. Réessayez ; si le problème persiste, contactez l’assistance.',
 de:'Der Vorgang ist fehlgeschlagen. Bitte erneut versuchen; falls das Problem weiterhin besteht, den Support kontaktieren.',
 pt:'Não foi possível concluir a operação. Tente novamente; se o problema persistir, contacte o apoio.'
};
export function v20SafeError(language='it'){
 const code=typeof language==='string'?language.toLowerCase().slice(0,2):'it';
 return COPY[code]||COPY.it;
}
