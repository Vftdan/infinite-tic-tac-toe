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
	_hostedGame = null;
	_hostedRoomIdSent = false;  // should not be copied to a reconnected client

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

	msg_hostGame(msg) {
		this.getHostedGame((err, game) => {
			if (err) {
				console.error(err);
				this.sendResponse([new messages.ShowError('Failed to create a room')]);
				return;
			}
			if (!game.registered) {
				this.sendResponse([new messages.ShowError('Room creation is already in progress')]);
				return;
			}
			this._hostedRoomIdSent = true;
			this.queueResponse([
				new messages.SetRoomId(game.roomId),
			]);
			this.joinGame(game);
			this.sendResponse(game.fetchGameState());
		});
	}

	_authCompleteMessages() {
		return [
			new messages.AuthComlete(),
			new messages.HostGameAvailable(),
			new messages.JoinRoomAvailable(),
		];
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
				this.sendResponse([
					new messages.SetCredentials(id, token),
				].concat(this._authCompleteMessages()));
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
		this._hostedGame = oldClient._hostedGame;
		this.sendResponse(this._authCompleteMessages());
	}

	leaveGame() {
		if (!this.game)
			return;
		var game = this.game;
		this.game = null;
		game.leaveClient(this);
	}

	joinGame(game) {
		if (this.game)
			this.leaveGame();
		this.game = game;
		game.joinClient(this);
	}

	getHostedGame(cb) {
		try {
			if (!this._hostedGame || this._hostedRoomIdSent) {
				var game = this._hostedGame;
				if (game) {
					game.unregister();
				} else {
					game = new GameSession();
					game.restartGame();
				}
				this._hostedGame = game;
				game.register((err) => {
					if (err) {
						this._hostedGame = null;
						return cb(err);
					}
					cb(null, game);
				});
			} else {
				cb(null, this._hostedGame);
			}
		} catch (err) {
			cb(err);
		}
	}
}

module.exports = ClientState;
