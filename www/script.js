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
			vecAvg: function(vecs, result) {
				if (result == undefined)
					result = vecs[0].slice(0);
				else
					for (var i = 1; i < vecs[0].length; ++i)
						result[i] = vecs[0][i];
				for (var i = 1; i < vecs.length; ++i)
					this.vecAdd(result, vecs[i], result);
				for (var i = 0; i < result.length; ++i)
					result[i] /= vecs.length;
				return result;
			},
			vecAbs: function(a) {
				var s = 0;
				for (var i = 0; i < a.length; ++i)
					s += a[i] * a[i];
				return Math.sqrt(s);
			},
		},
		camera: {
			origin: [0, 0],
			projectionMatrix: [
				[0.05,  0],  // world x
				[0, -0.05],  // world y
			],
			_defaultOrigin: [0, 0],
			_defaultProjectionMatrix: [
				[0.05,  0],
				[0, -0.05],
			],
			_unprojectionMatrix: null,
			_scale: 1,
			_minScale: .5,
			_maxScale: 4,
			setScale: function(scale) {
				if (isNaN(scale))
					scale = 1;
				scale = Math.min(this._maxScale, Math.max(this._minScale, scale));
				this._scale = scale;
				var mat = [
					this._defaultProjectionMatrix[0].slice(0),
					this._defaultProjectionMatrix[1].slice(0),
				];
				for (var i = 0; i < mat.length; ++i)
					for (var j = 0; j < mat[i].length; ++j)
						mat[i][j] *= scale;
				this.projectionMatrix = mat;
				this.getUnprojectionMatrix(true);
			},
			scaleBy: function(scale) {
				this.setScale(this._scale * scale);
			},
			getUnprojectionMatrix: function(invalidate) {
				if (invalidate || this._unprojectionMatrix == null)
					this._unprojectionMatrix = app.algebra.matInv2d(this.projectionMatrix, this._unprojectionMatrix);
				return this._unprojectionMatrix;
			},
			resetOrigin: function() {
				this.origin = this._defaultOrigin.slice(0);
			},
			moveBy: function(vec) {
				this.origin = app.algebra.vecAdd(this.origin, vec);
				for (var i = 0; i < this.origin.length; ++i)
					if (isNaN(this.origin[i]) || !isFinite(this.origin[i]))
						return this.resetOrigin();
			},
			warpPointTo: function(worldPos, viewportPos /* only drawing knows viewport space */) {  // changes the origin, so that this.project(worldPos) = viewportPos
				var wantedWorldPos = this.unproject(viewportPos);
				var delta = app.algebra.vecSub(worldPos, wantedWorldPos);
				this.moveBy(delta);
			},
			scaleAround: function(worldPos, scale) {  // scaleBy(scale) and moves origin, so that this.project(worldPos) doesn't change
				var viewportPos = this.project(worldPos);
				this.scaleBy(scale);
				this.warpPointTo(worldPos, viewportPos);
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
		controlsContainer: document.getElementById('controls'),
		messagesContainer: document.getElementById('messages'),
		showMessage: function(type, content) {
			var oldHeight = app.messagesContainer.scrollHeight;
			var p = document.createElement('p');
			p.className = 'message-' + type;
			p.innerText = content;
			app.messagesContainer.appendChild(p);
			app.messagesContainer.scrollTop += app.messagesContainer.scrollHeight - oldHeight;
		},
		drawing: {
			ctx: null,
			width: CANVAS_SIZE,
			height: CANVAS_SIZE,
			style: {
				lineWidth: 2,
				bgColor: [255, 255, 255, 1],
				winLineColor: [0, 0, 255, 1],
				gridColor: [120, 120, 120, 1],
				gridCoordinateColor: [0, 50, 0, 1],
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
			warpPointTo: function(worldPos, canvasPos) {  // changes camera origin, so that this.project(worldPos) = canvasPos
				app.camera.warpPointTo(worldPos, [canvasPos[0] / this.width, canvasPos[1] / this.height]);
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

					ctx.fillStyle = 'rgba(' + style.gridCoordinateColor + ')';
					ctx.textAlign = 'left';
					ctx.textBaseline = 'bottom';
					ctx.font = style.font;
					var coordinatesPosition = bounds[0].slice(0);
					for (var i = 0; i < 2; ++i) {
						var curr = firstPos[i];
						var pos = coordinatesPosition.slice(0);
						var lastEnd = -Infinity;
						while (curr <= bounds[1][i]) {
							pos[i] = curr;
							projectFn(pos, ctxPos);
							var textBounds = ctx.measureText(curr);
							var textBoundsVec = [textBounds.width, textBounds.actualBoundingBoxAscent - textBounds.actualBoundingBoxDescent];
							var endPos = app.algebra.vecAdd(ctxPos, textBoundsVec);
							if ((ctxPos[i] - lastEnd) * (endPos[i] - lastEnd) > 0) {
								ctx.fillText(curr, ctxPos[0] + 5, ctxPos[1]);
								lastEnd = endPos[i];
							}
							curr += cellSize;
						}
					}
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
			handleClick: function(cx, cy) {
				var pos = this.clientToWorldCoords(cx, cy);
				app.model.handleClick(pos);
			},
			warpPan: function(clientPos, worldPos) {
				app.drawing.warpPointTo(worldPos, this.clientToCanvasCoords(clientPos[0], clientPos[1]));
				app.drawing.drawScene();
			},
			scaleBy: function(cx, cy, scale) {
				app.camera.scaleAround(this.clientToWorldCoords(cx, cy), scale);
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
				singlePointerStart: function(e, pointerId /* for multitouch */) {  // mousedown or touchstart (for each touch)
					pointerId = pointerId || 0;
					this._pointers[pointerId] = {
						lastClientPos: [e.clientX, e.clientY],
						pendingClientPos: null,
						clientPerimeter: 0,
						aborted: false,
						finished: false,
						multi: false,  // there were simultaneous touches
					};
					// We use start position to avoid floating point error accumulation, but when the number of touches changes, we reset start positions of all pointers to have a standard multifinger scrolling
					this._resetPointerStarts();
				},
				singlePointerMove: function(e, pointerId) {
					pointerId = pointerId || 0;
					var pointer = this._pointers[pointerId];
					if (!pointer)
						return;
					if (e.buttons === 0) {  // it's a mouse event and the button was released outside
						pointer.aborted = true;
						return;
					}
					var clientPos = [e.clientX, e.clientY];
					pointer.pendingClientPos = clientPos;
				},
				singlePointerEnd: function(e, pointerId) {
					pointerId = pointerId || 0;
					var pointer = this._pointers[pointerId];
					if (!pointer)
						return;
					pointer.finished = true;
					this._resetPointerStarts();
				},
				processGestures: function(e) {
					var oldClientPoses = [];
					var newClientPoses = [];
					var startWorldPoses = [];
					for (var i = 0; i < this._pointers.length; ++i) {
						var pointer = this._pointers[i];
						if (!pointer)
							continue;
						if (pointer.finished && !pointer.multi && pointer.clientPerimeter < this.PAN_THRESHOLD)
							app.ui.handleClick(pointer.lastClientPos[0], pointer.lastClientPos[1]);
						if (pointer.finished || pointer.aborted) {
							this._pointers[i] = undefined;
							continue;
						}
						oldClientPoses.push(pointer.lastClientPos);
						startWorldPoses.push(pointer.startWorldPos);
						var newClientPos = pointer.lastClientPos;
						if (pointer.pendingClientPos) {
							var delta = app.algebra.vecSub(pointer.pendingClientPos, pointer.lastClientPos);
							pointer.clientPerimeter += app.algebra.vecAbs(delta);
							if (pointer.clientPerimeter >= this.PAN_THRESHOLD)
								newClientPos = pointer.pendingClientPos;
							pointer.lastClientPos = pointer.pendingClientPos;
							pointer.pendingClientPos = null;
						}
						newClientPoses.push(newClientPos);
					}
					if (!newClientPoses.length)
						return;
					var avgOldClientPos = app.algebra.vecAvg(oldClientPoses);
					var avgNewClientPos = app.algebra.vecAvg(newClientPoses);
					var avgStartWorldPos = app.algebra.vecAvg(startWorldPoses);
					app.ui.warpPan(avgNewClientPos, avgStartWorldPos);
					if (newClientPoses.length > 1) {
						var oldTotalDist = 0;
						var newTotalDist = 0;
						for (var i = 0; i < this._pointers.length; ++i) {
							if (this._pointers[i])
								this._pointers[i].multi = true;
						}
						for (var i = 0; i < newClientPoses.length; ++i) {
							var oldDeviation = app.algebra.vecSub(oldClientPoses[i], avgOldClientPos);
							var newDeviation = app.algebra.vecSub(newClientPoses[i], avgNewClientPos);
							oldTotalDist += app.algebra.vecAbs(oldDeviation);
							newTotalDist += app.algebra.vecAbs(newDeviation);
						}
						app.ui.scaleBy(avgNewClientPos[0], avgNewClientPos[1], newTotalDist / oldTotalDist);
					}
					e.preventDefault();
				},
				_resetPointerStarts: function() {
					for (var i = 0; i < this._pointers.length; ++i) {
						var pointer = this._pointers[i];
						if (!pointer)
							continue;
						var clientPos = pointer.lastClientPos.slice(0);
						var worldPos = app.ui.clientToWorldCoords(clientPos[0], clientPos[1]);
						pointer.startClientPos = clientPos;
						pointer.startWorldPos = worldPos;
					}
				},
				wheelScroll: function(e) {
					var SENSETIVITY = 0.05;
					var multiplier = Math.exp(-e.deltaY * SENSETIVITY);
					app.ui.scaleBy(e.clientX, e.clientY, multiplier);
					e.preventDefault();
				},
			},
			attachAllListeners: function() {  // should only be ran once
				var canvas = app.canvas;
				var extractTouches = function(e) {
					var result = [];
					for (var i = 0; i < e.changedTouches.length; ++i) {
						var touch = e.changedTouches[i];
						result.push([touch, touch.identifier]);
					}
					return result;
				};
				canvas.addEventListener('mousedown', function(e) {app.ui.gestures.singlePointerStart(e); app.ui.gestures.processGestures(e);}, false);
				canvas.addEventListener('mousemove', function(e) {app.ui.gestures.singlePointerMove(e);  app.ui.gestures.processGestures(e);}, false);
				canvas.addEventListener('mouseup',   function(e) {app.ui.gestures.singlePointerEnd(e);   app.ui.gestures.processGestures(e);}, false);
				canvas.addEventListener('wheel',     function(e) {app.ui.gestures.wheelScroll(e);}, false);
				var names = ['Start', 'Move', 'End'];
				for (var i = 0; i < names.length; ++i) {
					(function(name) {  // For does not create var scope!
						canvas.addEventListener('touch' + name.toLowerCase(), function(e) {
							var touches = extractTouches(e);
							for (var j = 0; j < touches.length; ++j)
								app.ui.gestures['singlePointer' + name].apply(app.ui.gestures, touches[j]);
							app.ui.gestures.processGestures(e);
						}, false);
					})(names[i]);
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
					app.showMessage('error', 'Occupied!');
					return;
				}
				this.expectSymbol = false;
				this.backends.placeSymbol(x, y);
			},
			restartGame: function() {
				this.backends.newGame();
			},
			_scrollIntoView: function(minPos, maxPos) {
				var curMinPos = app.drawing.unproject([0, 0]);
				var curMaxPos = app.drawing.unproject([app.canvas.width, app.canvas.height]);
				var dir = [0, 0];
				var ctxAnchorPos = [0, 0];
				for (var i = 0; i < 2; ++i) {
					var flipped = false;
					if (curMinPos[i] > curMaxPos[i]) {
						flipped = true;
						var temp = curMinPos[i];
						curMinPos[i] = curMaxPos[i];
						curMaxPos[i] = temp;
					}
					var exceedsHigher = maxPos[i] > curMaxPos[i];
					var exceedsLower = minPos[i] < curMinPos[i];
					if (exceedsHigher && !exceedsLower)
						dir[i] = 1;
					if (exceedsLower && !exceedsHigher)
						dir[i] = -1;
					ctxAnchorPos[i] = (exceedsHigher != flipped) ? app.canvas[['width', 'height'][i]] : 0;
				}
				var worldAnchorPos = app.drawing.unproject(ctxAnchorPos);
				for (var i = 0; i < 2; ++i) {
					if (dir[i])
						worldAnchorPos[i] = (dir[i] > 0) ? maxPos[i] : minPos[i];
				}
				app.drawing.warpPointTo(worldAnchorPos, ctxAnchorPos);
			},
			handleMessages: function(arr) {
				var fieldDirty = false;
				var scrollToCoords = null;
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
							this.field.setAt(msg.x | 0, msg.y | 0, msg.symbol);
							scrollToCoords = [msg.x, msg.y];
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
							app.showMessage('error', msg.text);
							break;
						case 'winGame':
							app.scene._elements.push(new app.shapes.LineSegment(msg.start.x + .5, msg.start.y + .5, msg.end.x + .5, msg.end.y + .5));
							this.won = true;
							app.showMessage('win', this.playerNames[msg.player] + ' won!');
							break;
						default:
							console.error('Unknown method: ' + obj.method);
					}
				}
				if (scrollToCoords) {
					this._scrollIntoView(scrollToCoords, app.algebra.vecAdd(scrollToCoords, [1, 1]));
					fieldDirty = true;
				}
				if (fieldDirty)
					app.drawing.drawScene();
			},
			backends: (function() {
				var localBackend = {
					_model: {
						won: false,
						WIN_CONDITION_CONSECUTIVE: 5,
						MAX_REMOTE_SYMBOL_DISTANCE: 100,  // how far away new symbols can be from the existing ones
						field: null,  // we will store the field content twice to minimize the difference with remote backends

						expectSymbol: false,
						currentPlayer: null,
						existingSymbolsBounds: [[0, 0], [0, 0]],
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
									new localBackend._responseConstructors.WaitSymbol(),
								];
							}

							if (
								x < this.existingSymbolsBounds[0][0] - 100 ||
								x > this.existingSymbolsBounds[1][0] + 100 ||
								y < this.existingSymbolsBounds[0][1] - 100 ||
								y > this.existingSymbolsBounds[1][1] + 100
							) {
								return [
									new localBackend._responseConstructors.ShowError("Too far away!"),
									new localBackend._responseConstructors.WaitSymbol(),
								];
							}
							this.existingSymbolsBounds[0][0] = Math.min(x, this.existingSymbolsBounds[0][0]);
							this.existingSymbolsBounds[1][0] = Math.max(x, this.existingSymbolsBounds[1][0]);
							this.existingSymbolsBounds[0][1] = Math.min(y, this.existingSymbolsBounds[0][1]);
							this.existingSymbolsBounds[1][1] = Math.max(y, this.existingSymbolsBounds[1][1]);

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
							this.existingSymbolsBounds = [[0, 0], [0, 0]];
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
	var fieldDeploy = document.getElementById('field');
	fieldDeploy.appendChild(app.canvas);
	app.ui.attachAllListeners();
	app.model.restartGame();

	var restartButton = document.createElement('input');
	restartButton.type = 'button';
	restartButton.value = 'Restart';
	restartButton.addEventListener('click', function() {
		app.model.restartGame();
	}, false);
	app.controlsContainer.appendChild(restartButton);
}, false);
