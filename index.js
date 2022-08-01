const http = require('http');
const fs = require('fs/promises');
const ws = require('ws');
const websocketHandling = require('./websocketHandling.js');

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
		res.writeHead(426, {  // Upgrade required
			Upgrade: 'websocket',
			Connection: 'Upgrade',
		});
		res.end('This is a websocket');
		return;
	}

	res.writeHead(404);
	res.end('Not found');
});

const wss = new ws.Server({server: server, path: '/' + wsPath});
websocketHandling(wss);

console.log('Starting the server on port ' + PORT);
server.listen(PORT);
