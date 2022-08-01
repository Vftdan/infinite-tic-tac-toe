const BaseRegistry = require('./BaseRegistry.js');

class GameRegistry extends BaseRegistry {
	ELEMENT_TYPE_NAME = 'game room';
	ELEMENT_IDENTIFIER_FIELD = 'roomId';
}

module.exports = new GameRegistry();
