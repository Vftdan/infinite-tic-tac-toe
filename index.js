const http = require('http');
const fs = require('fs/promises');

const PORT = 48321;

const staticFiles = ['index.html', 'style.css', 'script.js'];
const staticRoot = './www/';
const indexFile = 'index.html';
const wsPath = 'ws';

const server = http.createServer((req, res) => {
	let url = req.url;
	if (url[0] != '/') {
		console.error('Not an absolute path: ' + url);
		res.writeHead(400);
		res.end('Not an absolute path');
		return;
	}
	url = url.slice(1);

	if (url == '')
		url = indexFile;

	if (staticFiles.indexOf(url) >= 0) {
		fs.readFile(staticRoot + url).then((data) => {
			res.writeHead(200);  // TODO content type
			res.end(data);
		}).catch((e) => {
			res.writeHead(500);
			res.end(e.toString());
		});
		return;
	}

	if (url == wsPath) {
		// TODO
	}

	res.writeHead(404);
	res.end('Not found');
});

server.listen(PORT);
