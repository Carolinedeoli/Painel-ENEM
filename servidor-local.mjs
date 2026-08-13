/* =========================================================================
   SERVIDOR-LOCAL.MJS — SERVIDOR DE TESTE, SEM INSTALAR NADA

       node servidor-local.mjs           → http://localhost:8123
       node servidor-local.mjs 3000      → http://localhost:3000

   Só para desenvolvimento: escuta apenas em 127.0.0.1, não é acessível de
   fora da máquina e não substitui a publicação.

   Por que não usar o "python -m http.server": ele ignora o cabeçalho Range.
   Sem Range, o DuckDB não consegue ler pedaços dos Parquet e baixa cada
   arquivo inteiro — ~290 MB por sessão em vez de alguns megabytes. Este
   servidor responde 206 Partial Content, igual ao GitHub Pages.
========================================================================= */
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';

const RAIZ = path.resolve(process.cwd());
const PORTA = Number(process.argv[2] || 8123);

const TIPOS = {
    '.html': 'text/html; charset=utf-8',
    '.js':   'text/javascript; charset=utf-8',
    '.mjs':  'text/javascript; charset=utf-8',
    '.css':  'text/css; charset=utf-8',
    '.csv':  'text/csv; charset=utf-8',
    '.json': 'application/json; charset=utf-8',
    '.svg':  'image/svg+xml',
    '.png':  'image/png',
    '.ico':  'image/x-icon',
    '.parquet': 'application/octet-stream'
};

const servidor = http.createServer(function (req, res) {
    let relativo;
    try {
        relativo = decodeURIComponent(req.url.split('?')[0]);
    } catch (erro) {
        res.writeHead(400).end('URL inválida');
        return;
    }

    if (relativo.endsWith('/')) relativo += 'index.html';

    const alvo = path.join(RAIZ, relativo);

    // Impede que "../.." escape da pasta do projeto.
    if (alvo !== RAIZ && !alvo.startsWith(RAIZ + path.sep)) {
        res.writeHead(403).end('Fora da pasta do projeto');
        return;
    }

    fs.stat(alvo, function (erro, info) {
        if (erro || !info.isFile()) {
            res.writeHead(404, { 'content-type': 'text/plain; charset=utf-8' });
            res.end('404 — não encontrado: ' + relativo);
            return;
        }

        const tipo = TIPOS[path.extname(alvo).toLowerCase()] || 'application/octet-stream';

        // no-store evita ficar depurando código que o navegador guardou em cache.
        const cabecalhos = {
            'content-type': tipo,
            'accept-ranges': 'bytes',
            'cache-control': 'no-store'
        };

        const range = req.headers.range;
        if (range) {
            const partes = /bytes=(\d*)-(\d*)/.exec(range);
            if (partes) {
                const inicio = partes[1] ? Number(partes[1]) : 0;
                const fim = partes[2] ? Number(partes[2]) : info.size - 1;

                if (inicio >= info.size || fim >= info.size || inicio > fim) {
                    res.writeHead(416, { 'content-range': 'bytes */' + info.size }).end();
                    return;
                }

                cabecalhos['content-range'] = `bytes ${inicio}-${fim}/${info.size}`;
                cabecalhos['content-length'] = fim - inicio + 1;
                res.writeHead(206, cabecalhos);

                if (req.method === 'HEAD') { res.end(); return; }
                fs.createReadStream(alvo, { start: inicio, end: fim }).pipe(res);
                return;
            }
        }

        cabecalhos['content-length'] = info.size;
        res.writeHead(200, cabecalhos);

        if (req.method === 'HEAD') { res.end(); return; }
        fs.createReadStream(alvo).pipe(res);
    });
});

servidor.on('error', function (erro) {
    if (erro.code === 'EADDRINUSE') {
        console.error(`\n  A porta ${PORTA} já está em uso.`);
        console.error(`  Rode com outra porta:  node servidor-local.mjs ${PORTA + 1}\n`);
        process.exit(1);
    }
    throw erro;
});

servidor.listen(PORTA, '127.0.0.1', function () {
    console.log(`\n  Painel ENEM rodando localmente`);
    console.log(`  http://localhost:${PORTA}`);
    console.log(`\n  pasta: ${RAIZ}`);
    console.log(`  Ctrl+C para parar\n`);
});
