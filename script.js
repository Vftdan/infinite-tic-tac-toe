var app = null;

addEventListener('load', function() {
	var CANVAS_SIZE = 1080;
	app = {
		algebra: {  // matrices look transposed in code, we index column, then row
			matMul: function(a, b, c) {
				if (c == undefined)
					c = [];
				for (; c.length < b.length;)
					c.push([]);
				if (a.length == 0)
					return c;
				for (var i = 0; i < b.length; ++i)
					for (var j = 0; j < a[0].length; ++j) {
						var s = 0;
						for (var k = 0; k < a.length; ++k)
							s += a[k][j] * b[i][k];
						c[i][j] = s;
					}
				return c;
			},
			matInv2d: function(a, b) {
				if (b == undefined)
					b = [];
				var invDet = 1 / (a[0][0] * a[1][1] - a[1][0] * a[0][1]);
				for (var i = 0; i < 2; ++i) {
					if (b[i] == undefined)
						b[i] = [];
					for (var j = 0; j < 2; ++j) {
						b[i][j] = ((i + j) & 1 ? -1 : 1) *
							a[1 - j][1 - i] * invDet;
					}
				}
				return b;
			},
			vecAdd: function(a, b, c) {
				if (c == undefined)
					c = [];
				var length = Math.min(a.length, b.length);
				for (var i = 0; i < length; ++i)
					c[i] = a[i] + b[i];
				return c;
			},
			vecSub: function(a, b, c) {
				if (c == undefined)
					c = [];
				var length = Math.min(a.length, b.length);
				for (var i = 0; i < length; ++i)
					c[i] = a[i] - b[i];
				return c;
			},
		},
		camera: {
			origin: [0, 0],
			projectionMatrix: [
				[0.05,  0],  // world x
				[0, -0.05],  // world y
			],
			_unprojectionMatrix: null,
			getUnprojectionMatrix: function(invalidate) {
				if (invalidate || this._unprojectionMatrix == null)
					this._unprojectionMatrix = app.algebra.matInv2d(this.projectionMatrix, this._unprojectionMatrix);
				return this._unprojectionMatrix;
			},
			project: function(pos, result) {
				if (result == undefined)
					result = [0, 0];
				return app.algebra.vecAdd(app.algebra.matMul(this.projectionMatrix, [app.algebra.vecSub(pos, this.origin)], [result])[0], [0.5, 0.5], result);
			},
			unproject: function(pos, result) {
				if (result == undefined)
					result = [0, 0];
				return app.algebra.vecAdd(app.algebra.matMul(this.getUnprojectionMatrix(), [app.algebra.vecSub(pos, [0.5, 0.5])], [result])[0], this.origin, result);
			},
			getSceneBounds: function(topLeft, bottomRight) {  // primarily for clipping
				var p1 = this.unproject(topLeft),
				    p2 = this.unproject(bottomRight);
				return [
					[Math.min(p1[0], p2[0]), Math.min(p1[1], p2[1])],
					[Math.max(p1[0], p2[0]), Math.max(p1[1], p2[1])],
				];
			},
		},
		canvas: document.createElement('canvas'),
		controlsForm: document.getElementById('controls'),
		drawing: {
			ctx: null,
			width: CANVAS_SIZE,
			height: CANVAS_SIZE,
			style: {
				lineWidth: 2,
				bgColor: [255, 255, 255, 1],
				winLineColor: [0, 0, 255, 1],
				gridColor: [120, 120, 120, 1],
				ticTacToeColorSymbols: [0, 0, 0, 1],
				font: '24px sans-serif',
			},
			project: function(pos, result) {
				result = app.camera.project(pos, result);
				result[0] *= this.width;
				result[1] *= this.height;
				return result;
			},
			unproject: function(pos, result) {
				result = app.camera.unproject([pos[0] / this.width, pos[1] / this.height], result);
				return result;
			},
			_projectFn: function(pos, result) {
				return app.drawing.project(pos, result);
			},
			drawElement: function(elem, bounds, resolution) {
				if (bounds == undefined)
					bounds = app.camera.getSceneBounds([0, 0], [1, 1]);
				if (resolution == undefined)
					resolution = Math.min(bounds[1][0] - bounds[0][0], bounds[1][1] - bounds[0][1]) /
					             Math.max(this.width, this.height);
				elem.drawAt(this.ctx, this._projectFn, bounds, resolution, this.style);
			},
			drawScene: function() {
				this.ctx.clearRect(0, 0, this.width, this.height);
				this.ctx.fillStyle = 'rgba(' + this.style.bgColor + ')';
				this.ctx.fillRect(0, 0, this.width, this.height);
				var bounds = app.camera.getSceneBounds([0, 0], [1, 1]);
				var resolution = Math.min(bounds[1][0] - bounds[0][0], bounds[1][1] - bounds[0][1]) /
				                 Math.max(this.width, this.height);  // approximate scene units per pixel
				var elements = app.scene.getElements();
				for (var i = 0; i < elements.length; ++i) {
					this.drawElement(elements[i], bounds, resolution);
				}
			},
		},
		shapes: (function() {
			var LineSegment = function(x1, y1, x2, y2) {
				this.pos1 = [x1, y1];
				this.pos2 = [x2, y2];
			};
			LineSegment.prototype = {
				drawAt: function(ctx, projectFn, bounds, resolution, style) {
					ctx.strokeStyle = 'rgba(' + style.winLineColor + ')';
					ctx.lineWidth = style.lineWidth;
					ctx.beginPath();
					var ctxPos = [0, 0];
					projectFn(this.pos1, ctxPos);
					ctx.moveTo(ctxPos[0], ctxPos[1]);
					projectFn(this.pos2, ctxPos);
					ctx.lineTo(ctxPos[0], ctxPos[1]);
					ctx.stroke();
				},
			};

			var Grid = function(cellSize) {
				this.cellSize = cellSize;
			};
			Grid.prototype = {
				drawAt: function(ctx, projectFn, bounds, resolution, style) {
					ctx.strokeStyle = 'rgba(' + style.gridColor + ')';
					ctx.lineWidth = style.lineWidth / 2;
					ctx.beginPath();
					var firstPos = [];
					var cellSize = this.cellSize;
					for (var i = 0; i < 2; ++i) {
						var x = bounds[0][i];
						firstPos.push(Math.floor(x / cellSize) * cellSize);
					}
					var ctxPos = [0, 0];
					for (var i = 0; i < 2; ++i) {
						var pos1 = bounds[0].slice(0);
						var pos2 = bounds[1].slice(0);
						var curr = firstPos[i];
						while (curr <= bounds[1][i]) {
							pos1[i] = curr;
							pos2[i] = curr;
							projectFn(pos1, ctxPos);
							ctx.moveTo(ctxPos[0], ctxPos[1]);
							projectFn(pos2, ctxPos);
							ctx.lineTo(ctxPos[0], ctxPos[1]);
							curr += cellSize;
						}
					}
					ctx.stroke();
				}
			};

			var TicTacToeSymbols = function(field) {
				this.field = field;
			};
			TicTacToeSymbols.prototype = {
				drawAt: function(ctx, projectFn, bounds, resolution, style) {
					ctx.fillStyle = 'rgba(' + style.ticTacToeColorSymbols + ')';
					ctx.textAlign = 'left';
					ctx.textBaseline = 'bottom';
					ctx.font = ((1 / resolution) | 0) + 'px sans-serif';
					var minX = Math.floor(bounds[0][0]);
					var minY = Math.floor(bounds[0][1]);
					var maxX = Math.ceil(bounds[1][0]);
					var maxY = Math.ceil(bounds[1][1]);
					var pos = [0, 0];
					var ctxPos = [0, 0];
					for (pos[0] = minX; pos[0] <= maxX; ++pos[0])
						for (pos[1] = minY; pos[1] <= maxY; ++pos[1]) {
							var ch = '';
							switch (this.field.getAt(pos[0], pos[1])) {
								case app.model.CellContent.CROSS:
									ch = 'X';
									break;
								case app.model.CellContent.NOUGHT:
									ch = 'O';
									break;
								default:
									continue;
							}
							projectFn(pos, ctxPos);
							ctx.fillText(ch, ctxPos[0] + 0.125 / resolution, ctxPos[1] + 0.05 / resolution);
						}
				}
			};

			return {
				Grid: Grid,
				TicTacToeSymbols: TicTacToeSymbols,
				LineSegment: LineSegment,
			};
		})(),
		scene: {
			_elements: [],
			getElements: function() {
				return this._elements;
			},
		},
		ui: {
			handleClick: function(e) {
				var pos = this.clientToWorldCoords(e.clientX, e.clientY);
				app.model.handleClick(pos);
			},
			warpPan: function(e, worldPos) {
				var curWorldPos = this.clientToWorldCoords(e.clientX, e.clientY);
				var cameraDelta = app.algebra.vecSub(worldPos, curWorldPos);
				app.camera.origin = app.algebra.vecAdd(app.camera.origin, cameraDelta);
				app.drawing.drawScene();
			},
			clientToCanvasCoords: function(x, y) {
				var r = app.canvas.getBoundingClientRect();
				var scale = app.canvas.width / r.width;
				return [(x - r.left) * scale, (y - r.top) * scale];
			},
			clientToWorldCoords: function(x, y) {
				return app.drawing.unproject(this.clientToCanvasCoords(x, y));
			},
			gestures: {
				PAN_THRESHOLD: 10,  // minimum client{X,Y} change distance (not displacement)
				_pointers: [],
				rawClickStart: function(e, pointerId /* for multitouch */) {  // mousedown or touchstart (for each touch)
					pointerId = pointerId || 0;
					var clientPos = [e.clientX, e.clientY];
					var worldPos = app.ui.clientToWorldCoords(clientPos[0], clientPos[1]);
					this._pointers[pointerId] = {
						startClientPos: clientPos,
						lastClientPos: clientPos.slice(0),
						clientPerimeter: 0,
						startWorldPos: worldPos,
					};
					e.preventDefault();
				},
				rawClickMove: function(e, pointerId) {
					pointerId = pointerId || 0;
					var pointer = this._pointers[pointerId];
					if (!pointer)
						return;
					if (e.buttons === 0) {  // it's a mouse event and the button was released outside
						this._pointers[pointerId] = undefined;
						return;
					}
					var clientPos = [e.clientX, e.clientY];
					var delta = app.algebra.vecSub(clientPos, pointer.lastClientPos);
					pointer.lastClientPos = clientPos;
					pointer.clientPerimeter += Math.sqrt(delta[0] * delta[0] + delta[1] * delta[1]);
					if (pointer.clientPerimeter >= this.PAN_THRESHOLD)
						app.ui.warpPan(e, pointer.startWorldPos);
					e.preventDefault();
				},
				rawClickEnd: function(e, pointerId) {
					pointerId = pointerId || 0;
					var pointer = this._pointers[pointerId];
					if (!pointer)
						return;
					// rawClickMove may be called here, but we want to lower the chace of accidental movent on finger removement
					if (pointer.clientPerimeter < this.PAN_THRESHOLD)
						app.ui.handleClick(e);
					this._pointers[pointerId] = undefined;
					e.preventDefault();
				},
			},
			attachAllListeners: function() {  // should only be ran once
				var canvas = app.canvas;
				var extractTouches = function(e) {
					var result = [];
					for (var i = 0; i < e.changedTouches.length; ++i)
						reset.push([e.changedTouches[i], e.changedTouches[i].identifier]);
				}
				canvas.addEventListener('mousedown', function(e) {app.ui.gestures.rawClickStart(e);}, false);
				canvas.addEventListener('mousemove', function(e) {app.ui.gestures.rawClickMove(e); }, false);
				canvas.addEventListener('mouseup',   function(e) {app.ui.gestures.rawClickEnd(e);  }, false);
				var names = ['Start', 'Move', 'End'];
				for (var i = 0; i < names.length; ++i) {
					var name = names[i];
					canvas.addEventListener('touch' + name.toLowerCase(), function(e) {
						var touches = extractTouches(e);
						for (var j = 0; j < touches.length; ++j)
							app.ui.gestures['rawClick' + name].apply(app.ui.gestures, touches[j]);
					}, false);
				}
			},
		},
		model: {
			CellContent: {
				EMPTY: 0,
				CROSS: 1,
				NOUGHT: 2,
				MASK: 3,
			},
			playerNames: {
				1: 'Crosses',
				2: 'Noughts',
			},
			currentPlayer: null,
			localPlayer: null,
			TicTacToeField: (function() {
				var CHUNK_SIDE = 16;
				var BITS_PER_CELL = 2;
				var CELLS_PER_BYTE = (8 / BITS_PER_CELL) | 0;
				var Chunk = function(x, y) {
					this._data = new Uint8Array(CHUNK_SIDE * CHUNK_SIDE / CELLS_PER_BYTE);
					this.x = x;
					this.y = y;
				};
				Chunk.prototype = {
					_getOffset: function(x, y) {
						if (x < 0 || y < 0 || x >= CHUNK_SIDE || y >= CHUNK_SIDE) {
							console.error('Chunk-local out of bounds', x, y);
							return null;
						}
						var cellIdx = y * CHUNK_SIDE + x;
						var byteIdx = cellIdx / CELLS_PER_BYTE | 0;
						var bitOffset = (cellIdx % CELLS_PER_BYTE) * BITS_PER_CELL;
						return [byteIdx, bitOffset];
					},
					getLocal: function(x, y) {
						var offset = this._getOffset(x, y);
						if (!offset)
							return app.model.CellContent.EMPTY;
						return (this._data[offset[0]] >>> offset[1]) & app.model.CellContent.MASK;
					},
					getGlobal: function(x, y) {
						return this.getLocal(x - this.x, y - this.y);
					},
					setLocal: function(x, y, value) {
						var offset = this._getOffset(x, y);
						if (!offset)
							return app.model.CellContent.EMPTY;
						var old = this._data[offset[0]] >>> offset[1];
						this._data[offset[0]] ^= ((old ^ value) & app.model.CellContent.MASK) << offset[1];
						return value & app.model.CellContent.MASK;
					},
					setGlobal: function(x, y, value) {
						return this.setLocal(x - this.x, y - this.y, value);
					},
				};
				
				var TicTacToeField = function() {
					this.reset();
				};
				TicTacToeField.Chunk = Chunk;
				TicTacToeField.prototype = {
					getChunkFor: function(x, y, create) {
						var cx = Math.floor(x / CHUNK_SIDE) * CHUNK_SIDE;
						var cy = Math.floor(y / CHUNK_SIDE) * CHUNK_SIDE;
						var key = cx + ',' + cy;
						var chunk = this.chunks[key];
						if (!chunk && create) {
							chunk = new Chunk(cx, cy);
							this.chunks[key] = chunk;
						}
						return chunk;
					},
					getAt: function(x, y) {
						var chunk = this.getChunkFor(x, y, false);
						if (!chunk)
							return app.model.CellContent.EMPTY;
						return chunk.getGlobal(x, y);
					},
					setAt: function(x, y, value) {
						var chunk = this.getChunkFor(x, y, true);
						return chunk.setGlobal(x, y, value);
					},
					reset: function() {
						this.chunks = Object.create(null);
					},
				};

				return TicTacToeField;
			})(),
			field: null,
			expectSymbol: false,
			handleClick: function(pos) {
				if (!this.expectSymbol)
					return;
				var x = Math.floor(pos[0]);
				var y = Math.floor(pos[1]);
				if (this.field.getAt(x, y)) {
					alert('Occupied!');
					return;
				}
				this.expectSymbol = false;
				this.backends.placeSymbol(x, y);
			},
			restartGame: function() {
				this.backends.newGame();
			},
			handleMessages: function(arr) {
				var fieldDirty = false;
				for (var i = 0; i < arr.length; ++i) {
					var msg = arr[i];
					switch (msg.method) {
						case 'clearField':
							if (this.field)
								this.field.reset();
							else
								this.field = new app.model.TicTacToeField();
							app.scene._elements.length = 0;
							app.scene._elements.push(new app.shapes.Grid(1));
							app.scene._elements.push(new app.shapes.TicTacToeSymbols(this.field));
							fieldDirty = true;
							break;
						case 'placeSymbol':
							this.field.setAt(msg.x, msg.y, msg.symbol);
							fieldDirty = true;
							break;
						case 'setLocalPlayer':
							this.localPlayer = msg.player;
							break;
						case 'setCurrentPlayer':
							this.localPlayer = msg.player;
							break;
						case 'waitSymbol':
							this.expectSymbol = true;
							break;
						case 'showError':
							console.error('Received error: ' + msg.text);
							alert(msg.text);
							break;
						case 'winGame':
							app.scene._elements.push(new app.shapes.LineSegment(msg.start.x + .5, msg.start.y + .5, msg.end.x + .5, msg.end.y + .5));
							this.won = true;
							alert(this.playerNames[msg.player] + ' win!');
							break;
						default:
							console.error('Unknown method: ' + obj.method);
					}
				}
				if (fieldDirty)
					app.drawing.drawScene();
			},
			backends: (function() {
				var localBackend = {
					_model: {
						won: false,
						WIN_CONDITION_CONSECUTIVE: 5,
						field: null,  // we will store the field content twice to minimize the difference with remote backends
						expectSymbol: false,
						currentPlayer: null,
						_nextPlayer: function() {
							switch (this.currentPlayer) {
								case app.model.CellContent.CROSS:
									this.currentPlayer = app.model.CellContent.NOUGHT;
									break;
								case app.model.CellContent.NOUGHT:
									this.currentPlayer = app.model.CellContent.CROSS;
									break;
								default:
									console.error('Invalid current player: ' + this.currentPlayer);
							}
						},
						tryPlaceSymbol: function(x, y) {
							if (this.won)
								return [
									new localBackend._responseConstructors.ShowError("Game is already over!"),
								];
							x |= 0;
							y |= 0;
							if (this.field.getAt(x, y)) {
								return [
									new localBackend._responseConstructors.ShowError("Occupied!"),
								];
							}
							this.field.setAt(x, y, this.currentPlayer);
							var result = [
								new localBackend._responseConstructors.PlaceSymbol(x, y, this.currentPlayer),
							];
							var directions = [
								[0,  1],
								[1,  0],
								[1,  1],
								[1, -1],
							];
							var winLine = null;
							for (var i = 0; !winLine && i < directions.length; ++i) {
								winLine = this._checkWinAround([x, y], directions[i]);
							}
							if (winLine) {
								result.push(
									new localBackend._responseConstructors.WinGame(this.currentPlayer, winLine[0], winLine[1])
								);
								this.won = true;
							} else {
								this._nextPlayer();
								result.push.apply(result, [  // Trailing commas in functions will not work with browsers that run below ECMAScript 2017
									new localBackend._responseConstructors.SetLocalPlayer(this.currentPlayer),
									new localBackend._responseConstructors.SetCurrentPlayer(this.currentPlayer),
									new localBackend._responseConstructors.WaitSymbol(),
								]);
							}
							return result;
						},
						_checkWinAround: function(centerPos, step) {
							var values = [];
							var startPos = [
								centerPos[0] - (this.WIN_CONDITION_CONSECUTIVE - 1) * step[0],
								centerPos[1] - (this.WIN_CONDITION_CONSECUTIVE - 1) * step[1],
							];
							var count = this.WIN_CONDITION_CONSECUTIVE * 2 - 1;
							var pos = startPos.slice(0);
							for (var i = 0; i < count; ++i) {
								values.push(this.field.getAt(pos[0], pos[1]));
								pos[0] += step[0];
								pos[1] += step[1];
							}
							var seg = this._maxNonZeroConsecutive(values);
							if (seg[1] < this.WIN_CONDITION_CONSECUTIVE)
								return null;
							var startIdx = seg[0];
							var endIdx = seg[0] + seg[1] - 1;
							return [
								[startPos[0] + startIdx * step[0], startPos[1] + startIdx * step[1]],
								[startPos[0] +   endIdx * step[0], startPos[1] +   endIdx * step[1]],
							];
						},
						_maxNonZeroConsecutive: function(arr) {
							var res = [-1, 0];  // start, length
							if (arr.length < 1)
								return res;
							var start = 0;
							var value = arr[0];
							for (var i = 1; i <= arr.length; ++i) {
								if (!arr[i] || arr[i] != value) {
									var length = i - start;
									if (length > res[1]) {
										res[0] = start;
										res[1] = length;
									}
									value = arr[i];
									start = i;
								}
							}
							var length = arr.length - start;
							if (length > res[1]) {
								res[0] = start;
								res[1] = length;
							}
							return res;
						},
						restartGame: function() {
							this.won = false;
							if (this.field)
								this.field.reset();
							else
								this.field = new app.model.TicTacToeField();
							this.currentPlayer = app.model.CellContent.CROSS;
							return [
								new localBackend._responseConstructors.ClearField(),
								new localBackend._responseConstructors.SetLocalPlayer(1),
								new localBackend._responseConstructors.SetCurrentPlayer(1),
								new localBackend._responseConstructors.WaitSymbol(),
							];
						},
					},
					sendMessage: function(obj) {
						var handlers = this._messageHandlers;
						setTimeout(function() {  // run asynchronously
							var method = obj.method;
							if (handlers[method])
								handlers[method](obj);
							else
								handlers.__unknown__(obj);
						}, 0);
					},
					_messageHandlers__create: function() {
						function sendResponse(arr) {
							for (var i = 0; i < arr.length; ++i)
								arr[i].method = arr[i].method;  // Make 'method' an own property
							app.model.handleMessages(arr);
						}
						var constructors = this._responseConstructors;
						var model = this._model;
						var handlers = {
							__unknown__: function(obj) {
								sendResponse([
									new constructors.ShowError('Unknown method: ' + obj.method),
								]);
							},
							newGame: function(obj) {
								sendResponse(model.restartGame());
							},
							placeSymbol: function(obj) {
								sendResponse(model.tryPlaceSymbol(obj.x, obj.y));
							},
						};
						this._messageHandlers = Object.assign(Object.create(null), handlers);  // Remove prototype & implicit fields
						delete this._messageHandlers__create;
					},
					_responseConstructors: (function() {
						var constructors = {
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
							ShowError: function(text) {
								this.text = text;
							},
							WinGame: function(player, startPos, endPos) {
								this.player = player;
								this.start = {x: startPos[0], y: startPos[1]};
								this.end = {x: endPos[0], y: endPos[1]};
							},
						};
						for (var i in constructors)
							constructors[i].prototype = {method: i[0].toLowerCase() + i.slice(1)};
						return constructors;
					})(),
				};
				localBackend._messageHandlers__create();
				return {
					localBackend: localBackend,
					currentBackend: localBackend,
					newGame: function() {
						this.currentBackend.sendMessage({method: 'newGame'});
					},
					placeSymbol: function(x, y) {
						this.currentBackend.sendMessage({method: 'placeSymbol', x: x, y: y});
					},
				};
			})(),
		},
	};

	app.canvas.width  = CANVAS_SIZE;
	app.canvas.height = CANVAS_SIZE;
	app.drawing.ctx = app.canvas.getContext('2d');
	var deploy = document.getElementById('deploy');
	deploy.appendChild(app.canvas);
	app.ui.attachAllListeners();
	app.model.restartGame();

	var restartButton = document.createElement('input');
	restartButton.type = 'button';
	restartButton.value = 'Restart';
	restartButton.addEventListener('click', function() {
		app.model.restartGame();
	}, false);
	deploy.appendChild(restartButton);
}, false);
