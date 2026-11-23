import test from 'node:test';
import assert from 'node:assert/strict';
import net from 'node:net';
import { ImapFlow } from 'imapflow';

// Server IMAP finto in memoria: basta per i comandi che usa lib/mail-imap.mjs (accesso, INBOX,
// ricerca per data, intestazioni e messaggio completo per UID, uscita).
const MESSAGE = 'From: Enel <bollette@enel.it>\r\nTo: anna@example.org\r\nSubject: Bolletta luce\r\nDate: Mon, 23 Nov 2026 10:00:00 +0100\r\n\r\nImporto 84,50 euro\r\n';
const ENVELOPE = '("Mon, 23 Nov 2026 10:00:00 +0100" "Bolletta luce" (("Enel" NIL "bollette" "enel.it")) (("Enel" NIL "bollette" "enel.it")) (("Enel" NIL "bollette" "enel.it")) ((NIL NIL "anna" "example.org")) NIL NIL NIL "<1@enel.it>")';

function fakeServer() {
  const seen = [];
  const server = net.createServer(socket => {
    socket.setEncoding('utf8');
    socket.write('* OK [CAPABILITY IMAP4rev1 AUTH=PLAIN] pronto\r\n');
    let buffer = '';
    socket.on('data', chunk => {
      buffer += chunk;
      let end;
      while ((end = buffer.indexOf('\r\n')) >= 0) {
        const line = buffer.slice(0, end); buffer = buffer.slice(end + 2);
        const [tag, ...rest] = line.split(' ');
        const command = rest.join(' ');
        const verb = command.toUpperCase();
        seen.push(verb.split(' ').slice(0, 2).join(' '));
        const ok = (text = 'fatto') => socket.write(`${tag} OK ${text}\r\n`);
        if (verb.startsWith('CAPABILITY')) { socket.write('* CAPABILITY IMAP4rev1 AUTH=PLAIN\r\n'); ok(); }
        else if (verb.startsWith('LOGIN')) ok('[CAPABILITY IMAP4rev1] dentro');
        else if (verb.startsWith('LIST')) { socket.write('* LIST (\\HasNoChildren) "/" INBOX\r\n'); ok(); }
        else if (verb.startsWith('NAMESPACE')) { socket.write('* NAMESPACE (("" "/")) NIL NIL\r\n'); ok(); }
        else if (verb.startsWith('SELECT') || verb.startsWith('EXAMINE')) {
          socket.write('* FLAGS (\\Seen)\r\n* 2 EXISTS\r\n* OK [UIDVALIDITY 42] uid\r\n* OK [UIDNEXT 8] next\r\n');
          ok('[READ-WRITE] aperta');
        }
        else if (verb.startsWith('UID SEARCH')) { socket.write('* SEARCH 5 7\r\n'); ok(); }
        else if (verb.startsWith('UID FETCH 7') && verb.includes('BODY.PEEK[]')) {
          socket.write(`* 2 FETCH (UID 7 BODY[] {${Buffer.byteLength(MESSAGE)}}\r\n${MESSAGE})\r\n`); ok();
        }
        else if (verb.startsWith('UID FETCH 7')) { socket.write(`* 2 FETCH (UID 7 RFC822.SIZE ${Buffer.byteLength(MESSAGE)} ENVELOPE ${ENVELOPE})\r\n`); ok(); }
        else if (verb.startsWith('LOGOUT')) { socket.write('* BYE ciao\r\n'); ok(); socket.end(); }
        else ok();
      }
    });
    socket.on('error', () => {});
  });
  return new Promise(resolve => server.listen(0, '127.0.0.1', () => resolve({ server, port: server.address().port, seen })));
}

test('imapflow 2: i comandi usati per leggere le bollette dalla casella', async () => {
  const { server, port, seen } = await fakeServer();
  // Stesse opzioni di lib/mail-imap.mjs, tranne TLS (il server finto è in chiaro).
  const client = new ImapFlow({ host: '127.0.0.1', port, secure: false, auth: { user: 'anna@example.org', pass: 'segreta' },
    logger: false, disableAutoIdle: true, connectionTimeout: 5000, greetingTimeout: 5000, socketTimeout: 5000, doSTARTTLS: false });
  client.on('error', () => {});
  try {
    await client.connect();
    const lock = await client.getMailboxLock('INBOX');
    try {
      const uids = (await client.search({ since: new Date(Date.now() - 35 * 86400_000) }, { uid: true })) || [];
      assert.deepEqual(uids, [5, 7]);
      assert.equal(String(client.mailbox.uidValidity), '42');
      const info = await client.fetchOne(7, { envelope: true, size: true }, { uid: true });
      assert.equal(info.envelope.subject, 'Bolletta luce');
      assert.equal(info.envelope.from[0].address, 'bollette@enel.it');
      assert.equal(info.size, Buffer.byteLength(MESSAGE));
      const source = await client.fetchOne(7, { source: true }, { uid: true });
      assert.ok(Buffer.isBuffer(source.source));
      assert.match(source.source.toString(), /Importo 84,50 euro/);
    } finally { lock.release(); }
    await client.logout();
  } finally { client.close(); server.close(); }
  assert.ok(seen.some(c => c.startsWith('LOGIN')) || seen.some(c => c.startsWith('AUTHENTICATE')), 'accesso fatto');
});
