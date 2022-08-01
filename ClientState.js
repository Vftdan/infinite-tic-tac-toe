const messages = require('./responseMessages.js');
const registry = require('./clientRegistry.js');
const GameSession = require('./GameSession.js');

const knownMethods = new Set([
	'register',
	'login',
	'hostGame',
	'joinRoom',
	'acceptJoinRoom',
	// Game:
	'newGame',
	'fetchGameState',
	'placeSymbol',
]);

class ClientState {
	connection /*: WebSocket*/ = null;
	game /*: GameSession*/ = null;
	clientId = null;
	clientToken = null;
	lastActive = null;
	registered = false;
	_queued = [];

	constructor() {
		this.setActive();
	}

	setActive() {
		this.lastActive = +new Date();
	}

	queueResponse(msgs) {
		this._queued.push(...msgs);
	}

	sendResponse(msgs, cb) {
		if (this._queued.length) {
			msgs = this._queued.concat(msgs);
			this._queued.length = 0;
		}
		for (let msg of msgs)
			msg.method = msg.method;  // Make 'method' an own property
		if (this.connection)
			this.connection.send(JSON.stringify(msgs), {}, cb);
		else
			if (cb)
				cb(new Error('Not connected'));
	}

	sendFatal(text) {
		this.sendResponse([new messages.ShowError(text)], () => {
			if (this.connection)
				this.connection.close(4001, text);
		});
	}

	handleMessage(msg) {
		const method = msg.method;
		if (typeof method != 'string')
			return this.sendFatal('Server received a message without method');

		if (!knownMethods.has(method))
			return this.sendFatal('Server received a message with an unknown method: ' + method);

		const key = 'msg_' + method;
		if (typeof this[key] == 'function')
			this[key](msg);
		if (this.game && typeof this.game[key] == 'function')
			this.game[key](this, msg);
	}

	msg_register(msg) {
		this.register();
	}

	msg_login(msg) {
		this.login(msg.id, msg.token);
	}

	msg_fetchGameState(msg) {
		if (!this.game)
			this.sendResponse([new messages.ClearField()]);
	}

	register() {
		if (this.registered)
			return this.sendFatal('Already registered');
		registry.generateId((err, id) => {
			if (err) {
				console.error(err);
				this.sendFatal('Failed to generate client id');
				return;
			}
			this.clientId = id;
			registry.generateToken((err, token) => {
				if (err) {
					console.error(err);
					this.sendFatal('Failed to generate client token');
					return;
				}
				this.clientToken = token;
				registry.put(this);
				this.game = new GameSession();
				this.game.restartGame();
				this.sendResponse([
					new messages.SetCredentials(id, token),
					new messages.AuthComlete(),
				]);
			});
		});
	}

	unregister() {
		if (!this.registered)
			return;
		registry.removeId(this.clientId);
		this.sendFatal('Unregistered');
	}

	login(id, token) {
		if (this.registered)
			return this.sendFatal('Already registered');
		if (!registry.hasId(id)) {
			this.queueResponse([new messages.ShowError('Client not found, creating a new one')]);
			this.register();
			return;
		}
		const oldClient = registry.byId.get(id);
		if (oldClient.clientToken != token) {
			this.queueResponse([new messages.ShowError('Token mismatch, creating a new client')]);
			this.register();
			return;
		}
		oldClient.unregister();
		this.clientId = id;
		this.clientToken = token;
		registry.put(this);
		this.game = oldClient.game;
		this.sendResponse([
			new messages.AuthComlete(),
		]);
	}
}

module.exports = ClientState;
