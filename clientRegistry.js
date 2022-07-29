const crypto = require('crypto');

class ClientRegistry {
	MAX_ATTEMPTS = 4;
	ID_BYTES = 4;
	TOKEN_BYTES = 16;

	byId = new Map();

	hasId(id) {
		return this.byId.has(id);
	}

	getById(id) {
		return this.byId.get(id);
	}

	removeId(id) {
		if (!this.hasId(id))
			return;
		const client = this.getById(id);
		client.registered = false;
		this.byId.delete(id);
	}

	put(client) {
		const id = client.clientId;
		if (!id)
			throw new Error('Missing client id');
		if (this.hasId(id))
			throw new Error('Duplicate client id');  // TODO merge?
		this.byId.set(id, client);
		client.registered = true;
	}

	generateId(cb) {
		let nAttempts = 1;
		const makeAttempt = () => {
			crypto.randomBytes(this.ID_BYTES, (err, buf) => {
				if (err)
					return cb(err);
				const id = buf.toString('hex');
				if (this.hasId(id)) {
					++nAttempts;
					if (nAttempts > this.MAX_ATTEMPTS)
						cb(new Error('Too much attempts to generate a unique client id'));
					else
						makeAttempt();
					return;
				}
				cb(null, id);
			});
		};
		makeAttempt();
	}

	generateToken(cb) {
		crypto.randomBytes(this.TOKEN_BYTES, (err, buf) => {
			if (err)
				return cb(err);
			const token = buf.toString('hex');
			cb(null, token);
		});
	}
}

module.exports = new ClientRegistry();
