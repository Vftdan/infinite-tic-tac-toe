const ClientState = require('./ClientState.js');

module.exports = function(wss) {
	wss.on('connection', (conn /*: WebSocket*/, req) => {
		const client = new ClientState();
		client.connection = conn;
		conn.__TicTacToe_client = client;

		conn.on('close', (code, reason) => {
			client.connection = null;
		});

		conn.on('message', (data, isBinary) => {
			var msg;
			try {
				msg = JSON.parse(data.toString('utf8'));
			} catch(e) {
				client.sendFatal('Not a JSON message');
				return;
			}
			client.handleMessage(msg);
		});

		conn.on('close', (code, reason) => {
			client.connection = null;
		});
	});
}
