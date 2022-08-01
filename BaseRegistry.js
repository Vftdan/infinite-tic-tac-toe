const crypto = require('crypto');

class BaseRegistry {
	MAX_ATTEMPTS = 4;
	ID_BYTES = 4;
	ELEMENT_TYPE_NAME = '<registry element>';
	ELEMENT_IDENTIFIER_FIELD = '_registryIndex';
	ELEMENT_IDENTIFIER_NAME = 'id';
	ELEMENT_REGISTERED_FLAG_FIELD = 'registered';

	byId = new Map();

	static generateHexString(byteCount, cb) {
		crypto.randomBytes(byteCount, (err, buf) => {
			if (err)
				return cb(err);
			const token = buf.toString('hex');
			cb(null, token);
		});
	}

	hasId(id) {
		return this.byId.has(id);
	}

	getById(id) {
		return this.byId.get(id);
	}

	removeId(id) {
		if (!this.hasId(id))
			return;
		const element = this.getById(id);
		element[this.ELEMENT_REGISTERED_FLAG_FIELD] = false;
		this.byId.delete(id);
	}

	put(element) {
		const id = element[this.ELEMENT_IDENTIFIER_FIELD];
		if (!id)
			throw new Error('Missing ' + this.ELEMENT_TYPE_NAME + ' ' + this.ELEMENT_IDENTIFIER_NAME);
		if (this.hasId(id))
			throw new Error('Duplicate ' + this.ELEMENT_TYPE_NAME + ' ' + this.ELEMENT_IDENTIFIER_NAME);
		this.byId.set(id, element);
		element[this.ELEMENT_REGISTERED_FLAG_FIELD] = true;
	}

	generateId(cb) {
		let nAttempts = 1;
		const makeAttempt = () => {
			BaseRegistry.generateHexString(this.ID_BYTES, (err, id) => {
				if (err)
					return cb(err);
				if (this.hasId(id)) {
					++nAttempts;
					if (nAttempts > this.MAX_ATTEMPTS)
						cb(new Error('Too much attempts to generate a unique ' + this.ELEMENT_TYPE_NAME + ' id'));
					else
						makeAttempt();
					return;
				}
				cb(null, id);
			});
		};
		makeAttempt();
	}
}

module.exports = BaseRegistry;
