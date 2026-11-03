import { syncConnection as syncGmail } from './mail-google.mjs';
import { syncMicrosoftConnection } from './mail-microsoft.mjs';
import { syncImapConnection } from './mail-imap.mjs';
import { isImapProvider } from './mail-providers.mjs';
export function syncConnection(admin,connection,options){
  if(connection.provider==='gmail')return syncGmail(admin,connection,options);
  if(connection.provider==='outlook')return syncMicrosoftConnection(admin,connection,options);
  if(isImapProvider(connection.provider))return syncImapConnection(admin,connection,options);
  throw new Error('Provider di posta sconosciuto.');
}
