const messages = require('./responseMessages.js');
const registry = require('./gameRegistry.js');
const clientRegistry = require('./clientRegistry.js');

const CellContent = {
	EMPTY: 0,
	CROSS: 1,
	NOUGHT: 2,
	MASK: 3,
};

const CHUNK_SIDE = 16;
const BITS_PER_CELL = 2;
const CELLS_PER_BYTE = (8 / BITS_PER_CELL) | 0;

class Chunk {
	_data = new Uint8Array(CHUNK_SIDE * CHUNK_SIDE / CELLS_PER_BYTE);
	x = null;
	y = null;
	roomId = null;

	constructor(x, y) {
		this.x = x;
		this.y = y;
	}

	_getOffset(x, y) {
		if (x < 0 || y < 0 || x >= CHUNK_SIDE || y >= CHUNK_SIDE) {
			console.error('Chunk-local out of bounds', x, y);
			return null;
		}
		const cellIdx = y * CHUNK_SIDE + x;
		const byteIdx = cellIdx / CELLS_PER_BYTE | 0;
		const bitOffset = (cellIdx % CELLS_PER_BYTE) * BITS_PER_CELL;
		return [byteIdx, bitOffset];
	}

	getLocal(x, y) {
		const offset = this._getOffset(x, y);
		if (!offset)
			return CellContent.EMPTY;
		return (this._data[offset[0]] >>> offset[1]) & CellContent.MASK;
	}

	getGlobal(x, y) {
		return this.getLocal(x - this.x, y - this.y);
	}

	setLocal(x, y, value) {
		const offset = this._getOffset(x, y);
		if (!offset)
			return CellContent.EMPTY;
		const old = this._data[offset[0]] >>> offset[1];
		this._data[offset[0]] ^= ((old ^ value) & CellContent.MASK) << offset[1];
		return value & CellContent.MASK;
	}

	setGlobal(x, y, value) {
		return this.setLocal(x - this.x, y - this.y, value);
	}
}

class TicTacToeField {
	chunks = Object.create(null);

	getChunkFor(x, y, create) {
		const cx = Math.floor(x / CHUNK_SIDE) * CHUNK_SIDE;
		const cy = Math.floor(y / CHUNK_SIDE) * CHUNK_SIDE;
		const key = cx + ',' + cy;
		let chunk = this.chunks[key];
		if (!chunk && create) {
			chunk = new Chunk(cx, cy);
			this.chunks[key] = chunk;
		}
		return chunk;
	}

	getAt(x, y) {
		const chunk = this.getChunkFor(x, y, false);
		if (!chunk)
			return CellContent.EMPTY;
		return chunk.getGlobal(x, y);
	}

	setAt(x, y, value) {
		const chunk = this.getChunkFor(x, y, true);
		return chunk.setGlobal(x, y, value);
	}

	reset() {
		this.chunks = Object.create(null);
	}

	getBoundaries() {
		const boxes = [];
		for (let i in this.chunks) {
			const chunk = this.chunks[i];
			boxes.push([
				[chunk.x, chunk.y],
				[chunk.x + CHUNK_SIDE, chunk.y + CHUNK_SIDE],
			]);
		}
		return boxes;
	}
}

TicTacToeField.Chunk = Chunk;

const MAX_CLIENTS = 2;

class GameSession {
	won = false;
	winLine = null;
	WIN_CONDITION_CONSECUTIVE = 5;
	MAX_REMOTE_SYMBOL_DISTANCE = 100;  // how far away new symbols can be from the existing ones
	field = null;  // we will store the field content twice to minimize the difference with remote backends

	currentPlayer = null;
	existingSymbolsBounds = [[0, 0], [0, 0]];

	_clientIds = new Set();
	_clientPlayers = (new Map()).set(null, [CellContent.CROSS, CellContent.NOUGHT]);
	_playerClients = new Map();
	_pendingClients = new Set();

	constructor() {
		for (const [client, players] of this._clientPlayers)
			for (const player of players)
				this._playerClients.set(player, client);
	}

	_nextPlayer() {
		switch (this.currentPlayer) {
			case CellContent.CROSS:
				this.currentPlayer = CellContent.NOUGHT;
				break;
			case CellContent.NOUGHT:
				this.currentPlayer = CellContent.CROSS;
				break;
			default:
				console.error('Invalid current player: ' + this.currentPlayer);
		}
	}

	isCurrentClient(client) {
		const clientId = client.clientId;
		return clientId && this._playerClients.get(this.currentPlayer) == clientId;
	}

	broadcastResponse(msg) {
		for (const client of this.getClients()) {
			if (client.game == this)
				client.sendResponse(msg);
		}
	}

	tryPlaceSymbol(client, x, y) {
		if (this.won)
			return [
				new messages.ShowError("Game is already over!"),
			];
		if (!this.isCurrentClient(client))
			return [
				new messages.ShowError("It's another player's turn"),
			];
		x = +x | 0;
		y = +y | 0;
		if (this.field.getAt(x, y)) {
			return [
				new messages.ShowError("Occupied!"),
				new messages.WaitSymbol(),
			];
		}

		if (
			x < this.existingSymbolsBounds[0][0] - 100 ||
			x > this.existingSymbolsBounds[1][0] + 100 ||
			y < this.existingSymbolsBounds[0][1] - 100 ||
			y > this.existingSymbolsBounds[1][1] + 100
		) {
			return [
				new messages.ShowError("Too far away!"),
				new messages.WaitSymbol(),
			];
		}
		this.existingSymbolsBounds[0][0] = Math.min(x, this.existingSymbolsBounds[0][0]);
		this.existingSymbolsBounds[1][0] = Math.max(x, this.existingSymbolsBounds[1][0]);
		this.existingSymbolsBounds[0][1] = Math.min(y, this.existingSymbolsBounds[0][1]);
		this.existingSymbolsBounds[1][1] = Math.max(y, this.existingSymbolsBounds[1][1]);

		this.field.setAt(x, y, this.currentPlayer);
		const publicResult = [
			new messages.PlaceSymbol(x, y, this.currentPlayer),
		];
		const directions = [
			[0,  1],
			[1,  0],
			[1,  1],
			[1, -1],
		];
		let winLine = null;
		for (let i = 0; !winLine && i < directions.length; ++i) {
			winLine = this._checkWinAround([x, y], directions[i]);
		}
		if (winLine) {
			publicResult.push(
				new messages.WinGame(this.currentPlayer, winLine[0], winLine[1])
			);
			this.winLine = winLine;
			this.won = true;
		} else {
			this._nextPlayer();
			publicResult.push(
				new messages.SetCurrentPlayer(this.currentPlayer),
			);
		}
		this.broadcastResponse(publicResult);
		this.updateLocalPlayers();
		return [];
	}

	_checkWinAround(centerPos, step) {
		const values = [];
		const startPos = [
			centerPos[0] - (this.WIN_CONDITION_CONSECUTIVE - 1) * step[0],
			centerPos[1] - (this.WIN_CONDITION_CONSECUTIVE - 1) * step[1],
		];
		const count = this.WIN_CONDITION_CONSECUTIVE * 2 - 1;
		const pos = startPos.slice(0);
		for (let i = 0; i < count; ++i) {
			values.push(this.field.getAt(pos[0], pos[1]));
			pos[0] += step[0];
			pos[1] += step[1];
		}
		const seg = this._maxNonZeroConsecutive(values);
		if (seg[1] < this.WIN_CONDITION_CONSECUTIVE)
			return null;
		const startIdx = seg[0];
		const endIdx = seg[0] + seg[1] - 1;
		return [
			[startPos[0] + startIdx * step[0], startPos[1] + startIdx * step[1]],
			[startPos[0] +   endIdx * step[0], startPos[1] +   endIdx * step[1]],
		];
	}

	_maxNonZeroConsecutive(arr) {
		const res = [-1, 0];  // start, length
		if (arr.length < 1)
			return res;
		let start = 0;
		let value = arr[0];
		for (let i = 1; i <= arr.length; ++i) {
			if (!arr[i] || arr[i] != value) {
				const length = i - start;
				if (length > res[1]) {
					res[0] = start;
					res[1] = length;
				}
				value = arr[i];
				start = i;
			}
		}
		const length = arr.length - start;
		if (length > res[1]) {
			res[0] = start;
			res[1] = length;
		}
		return res;
	}

	setLocalPlayer(client, player) {
		if (client.localPlayer == player)
			return [];
		client.localPlayer = player;
		return new [messages.SetLocalPlayer(player)];
	}

	updateLocalPlayers() {
		for (const client of this.getClients()) {
			if (client.game != this)
				continue;
			const clientId = client.clientId;
			const isCurrentPlayer = this.isCurrentClient(client);
			const localPlayer = isCurrentPlayer ? this.currentPlayer : this._clientPlayers.get(clientId)[0];
			let res = [];
			if (localPlayer)
				res = this.setLocalPlayer(client, localPlayer);
			if (!this.won && isCurrentPlayer)
				res.push(new messages.WaitSymbol());
			if (res.length)
				client.sendResponse(res);
		}
	}

	fetchGameState(client) {
		const res = [
			new messages.ClearField(),
			new messages.SetCurrentPlayer(this.currentPlayer),
		];
		const clientId = client.clientId;
		if (!this._clientIds.has(clientId)) {
			console.error('Non-member client ' + clientId + ' is fetching game state of the room ' + this.roomId);
			return res;
		}
		const isCurrentPlayer = this.isCurrentClient(client);
		const localPlayer = isCurrentPlayer ? this.currentPlayer : this._clientPlayers.get(clientId)[0];
		if (localPlayer) {
			client.localPlayer = localPlayer;
			res.push(new messages.SetLocalPlayer(localPlayer));
		}

		const boxes = this.field ? this.field.getBoundaries() : [];
		for (let box of boxes) {
			const start = box[0];
			const end   = box[1];
			for (let x = start[0]; x < end[0]; ++x)
				for (let y = start[1]; y < end[1]; ++y) {
					const symbol = this.field.getAt(x, y);
					if (symbol)
						res.push(new messages.PlaceSymbol(x, y, symbol));
				}
		}

		if (this.won)
			res.push(new messages.WinGame(this.currentPlayer, this.winLine[0], this.winLine[1]));
		else if (isCurrentPlayer)
			res.push(new messages.WaitSymbol());

		for (const pendingClientId of this._pendingClients)
			res.push(new messages.JoinRoomRequest(pendingClientId));

		return res;
	}

	restartGame() {
		this.won = false;
		if (this.field)
			this.field.reset();
		else
			this.field = new TicTacToeField();
		this.currentPlayer = CellContent.CROSS;
		this.existingSymbolsBounds = [[0, 0], [0, 0]];
		return [
			new messages.ClearField(),
			new messages.SetCurrentPlayer(1),
		];
	}

	msg_newGame(client, msg) {
		this.broadcastResponse(this.restartGame());
		this.updateLocalPlayers();
	}

	msg_fetchGameState(client, msg) {
		client.sendResponse(
			this.fetchGameState(client)
		);
	}

	msg_placeSymbol(client, msg) {
		const res = this.tryPlaceSymbol(client, msg.x, msg.y);
		if (res.length)
			client.sendResponse(res);
	}

	msg_acceptJoinRoom(acceptingClient, msg) {
		const clientId = msg.id;
		if (!clientId)
			return acceptingClient.sendFatal('Missing id argument in acceptJoinRoom');
		if (!this._pendingClients.has(clientId))
			return acceptingClient.sendResponse([new messages.ShowError('Client ' + clientId + ' did not request to join')]);

		const newClient = clientRegistry.getById(clientId);
		if (!newClient)
			return acceptingClient.sendResponse([new messages.ShowError('Client ' + clientId + ' does not exist anymore')]);

		if (!this.joinClient(newClient)) {
			acceptingClient.sendResponse([new messages.ShowError('The room is full')]);
			newClient.sendResponse([new messages.ShowError('Cannot join: the room is full')]);
			return;
		}
		this._pendingClients.delete(clientId);
		newClient.sendResponse(this.fetchGameState(newClient));
	}

	register(cb) {
		if (!cb)
			cb = (err) => {if (err) throw err;};
		if (this.registered)
			return cb(new Error('Already registered'));
		registry.generateId((err, id) => {
			if (err) {
				return cb(err);
			}
			this.roomId = id;
			registry.put(this);
			cb();
		});
	}

	unregister() {
		if (!this.registered)
			return;
		registry.removeId(this.roomId);
		this.registered = false;
		var clients = this.getClients();
		for (let client of clients) {
			if (client.game == this) {
				client.leaveGame();
				client.sendResponse([
					new messages.ClearField(),
					new messages.ShowError('The room was closed'),
				]);
			}
		}
	}

	getClients() {
		const clients = [];
		for (const clientId of this._clientIds) {
			const client = clientRegistry.getById(clientId);
			if (client)
				clients.push(client);
		}
		return clients;
	}

	leaveClient(client) {
		const clientId = client.clientId;
		if (!this._clientIds.has(clientId)) {
			console.error('Non-member client ' + clientId + ' tried to leave the room ' + this.roomId);
			return false;
		}
		this._clientIds.delete(clientId);

		const players = this._clientPlayers.get(clientId);
		this._clientPlayers.get(null).push(...players);
		this._clientPlayers.delete(clientId)

		for (const player of players)
			this._playerClients.set(player, null);

		client.game = null;
		return true;
	}

	joinClient(client) {
		if (this._clientIds.size > MAX_CLIENTS)
			return false;
		const clientId = client.clientId;
		if (!clientId) {
			console.error('Client without id tried to join room ' + this.roomId);
			return false;
		}
		if (this._clientIds.has(clientId))
			return false;

		if (client.game != this)
			client.leaveGame();
		this._clientIds.add(clientId);
		const players = [];
		const unallocatedPlayers = this._clientPlayers.get(null);
		if (unallocatedPlayers.length) {
			const player = unallocatedPlayers.shift();
			players.push(player);
			this._playerClients.set(player, clientId);
			client.localPlayer = player;
		}
		this._clientPlayers.set(clientId, players);

		client.game = this;
		return true;
	}

	requestJoin(client) {
		const clientId = client.clientId;
		if (!clientId)
			return client.sendResponse([new messages.ShowError('Not authenticated')]);
		if (this._clientIds.has(clientId))
			return client.sendResponse([new messages.ShowError('You are already in the room')]);
		if (this._clientIds.size > MAX_CLIENTS)
			return client.sendResponse([new messages.ShowError('The room is full')]);

		this._pendingClients.add(clientId);
		this.broadcastResponse([new messages.JoinRoomRequest(clientId)]);
	}
}

GameSession.TicTacToeField = TicTacToeField;
GameSession.CellContent = CellContent;

module.exports = GameSession;
