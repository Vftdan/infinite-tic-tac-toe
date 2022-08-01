const BaseRegistry = require('./BaseRegistry.js');

class ClientRegistry extends BaseRegistry {
	TOKEN_BYTES = 16;
	ELEMENT_TYPE_NAME = 'client';
	ELEMENT_IDENTIFIER_FIELD = 'clientId';

	generateToken(cb) {
		BaseRegistry.generateHexString(this.TOKEN_BYTES, cb);
	}
}

module.exports = new ClientRegistry();
