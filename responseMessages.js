const messages = {
	SetCredentials: function(id, token) {
		this.id = id;
		this.token = token;
	},
	AuthComlete: function() {},
	ShowError: function(text) {
		this.text = text;
	},
	ShowInfo: function(text) {
		this.text = text;
	},
	HostGameAvailable: function() {},
	JoinRoomAvailable: function() {},
	SetRoomId: function(id) {
		this.id = id;
	},
	JoinRoomRequest: function(id) {
		this.id = id;
	},
	// Game:
	ClearField: function() {},
	PlaceSymbol: function(x, y, symbol) {
		this.x = x;
		this.y = y;
		this.symbol = symbol;
	},
	SetLocalPlayer: function(player) {
		this.player = player;
	},
	SetCurrentPlayer: function(player) {
		this.player = player;
	},
	WaitSymbol: function() {},
	WinGame: function(player, startPos, endPos) {
		this.player = player;
		this.start = {x: startPos[0], y: startPos[1]};
		this.end = {x: endPos[0], y: endPos[1]};
	},
};
for (let i in messages)
	messages[i].prototype = {method: i[0].toLowerCase() + i.slice(1)};

module.exports = messages;
