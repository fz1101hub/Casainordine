// Sostituto vuoto di iceberg-js, solo per il browser: storage-js lo usa per i bucket «analytics»,
// che l'app non usa. Archivio, foto e verbali passano dal normale Storage.
export class IcebergRestCatalog {
  constructor() { throw new Error('Bucket analytics non attivi in Casa in Ordine'); }
}
