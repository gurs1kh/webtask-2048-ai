'use latest';
import curl from 'curl';

// const url = "https://wt-8157dd454a631cc22b6131279d5193e4-0.run.webtask.io/2048-server";
const url = "http://localhost:1234";
const gameHistory = [];

module.exports = function(context, cb) {
  curl.getJSON(url + '/new', function(err, response, body) {
		if (err) {
      cb(err);
      return;
    }
		gameHistory.push(body);
		console.log(body);
    let game = new Game(body);
    let agent = new Agent(game);
    cb(null, `The game has started and is viewable at ${url}/${body._id}`);
    playGame(agent, body._id, cb);
  });
}

function playGame(agent, id, cb) {
	let move = agent.evaluateMove().move;
  if (move < 0 || move > 3) cb("move: " + move);
	console.log(url + `/${id}/${move}`);
	curl.getJSON(url + `/${id}/${move}`, function(err, response, body) {
		if (err) cb(err);
		gameHistory.push(body);
		console.log(body);
		if (body.gameOver) {
			cb(null, gameHistory);
		} else {
      agent.game = new Game(body);
    	playGame(agent, id, cb);
		}
  });
}

class Agent {
  constructor(game, depth = 5) {
    this.depth = depth;
    this.game = game;
  }

  //makes clone of this Agent
  clone() {
    return new Agent(this.game.clone());
  }

  //evaluates the possible moves for the best choice
  evaluateMove(level) {
    if (level == null) {
      level = this.depth;
    }
  	if (level <= 0) {
  		return { move: -1, score: this.evaluateBoard()};
    }
  	let moves = [];
  	for (let i = 0; i < 4; i++) {
      let clone = this.clone();
      clone.game.makeMove(i);
  		moves[i] = clone.evaluateMove(level - 1);
  		moves[i].move = i;
  	}
    moves.sort(function(a, b) {
  		return b.score - a.score;
  	});

    //make sure that move chosen is actually a valid move
  	for (let i = 0; i < moves.length; i++) {
  		if (this.game.makeMove(moves[i].move)) {
  			return moves[i];
      }
    }
  	return { move: Math.floor(Math.random() * 4), score: 0 };
  }

  //evaluates and scores the current board based on various heuristics
  evaluateBoard() {
  	//weights
  	const smoothWeight = 2;
  	const monWeight = 0.5;
  	const maxWeight = 1;
  	const posWeight = 2;
  	const emptyWeight = 2;
  	const chainWeight = 2;

    let smoothness = this.calcSmoothness();
  	let monotonicity = this.calcMontonicity();
  	let max = Math.log2(this.maxTile());
  	let maxPos = this.maxPosition();
  	let empty = this.countEmpty();
  	let chain = this.chainScore();
  	let total =
  			    smoothness * smoothWeight +
  			    monotonicity * monWeight +
  			    // maxPos * max * posWeight +
  					max * maxWeight +
  			    empty * emptyWeight +
  			    // chain * max * chainWeight +
  					0;
  	if (max >= 11) total += 100;
  	return total;
  };

  //returns to number of empty cells
  countEmpty() {
    let board = this.game.board;
  	let count = 0;
  	for (let i = 0; i < board.length; i++) {
  		for (let j = 0; j < board[i].length; j++) {
  			if (board[i][j] == 0) {
  				count++;
        }
      }
    }
  	return count;
  }

  //calculation of smoothness (how similar neighboring tiles are)
  calcSmoothness() {
    let board = this.game.board;
  	let smoothness = 0;
  	for (let i = 0; i < board.length; i++) {
  		let previous = board[i][0];
  		for (let j = 1; j < board[i].length; j++) {
  			if (board[i][j]) {
  				let current = board[i][j];
  				if (current == previous) {
  					smoothness += current;
  				}
  				previous = current;
  			}
  		}
  	}
  	for (let i = 0; i < board[0].length; i++) {
  		let previous = board[0][i];
  		for (let j = 1; j < board.length; j++) {
  			if (board[j][i]) {
  				let current = board[j][i];
  				if (current == previous) {
  					smoothness += current;
  				}
  				previous = current;
  			}
  		}
  	}
  	return smoothness / this.maxTile();
  }

  //calculation of monotonicity (how much tiles are ordered in a row/column)
  calcMontonicity() {
    let board = this.game.board;
  	let monotonicity = 0;
  	for (let i = 0; i < board.length; i++) {
  		let previous = board[i][0];
  		for (let j = 1; j < board[i].length; j++) {
  			if (board[i][j]) {
  				let current = board[i][j];
  				let range = [previous / 2, previous * 2];
  				if (range.indexOf(current) != -1) {
  						monotonicity += Math.max(current, previous);
  				}
  				previous = current;
  			}
  		}
  	}
  	for (let i = 0; i < board[0].length; i++) {
  		let previous = board[0][i];
  		for (let j = 1; j < board.length; j++) {
  			if (board[j][i]) {
  				let current = board[j][i];
  				let range = [previous / 2, previous * 2];
  				if(range.indexOf(current) != -1) {
  						monotonicity += Math.max(current, previous);
  				}
  				previous = current;
  			}
  		}
  	}
  	return monotonicity / this.maxTile();
  }

  //returns the max tile(s)
  maxInfo() {
    let board = this.game.board;
  	let max = [{value: 0, x: -1, y: -1}];
  	for (let i = 0; i < board.length; i++) {
  		for (let j = 0; j < board[i].length; j++) {
  			if (board[i][j]) {
  				let value = board[i][j];
  				if (value > max[0].value) {
  					max = [{value: value, x: i, y: j}];
  				} else if (value == max[0].value) {
  					max.push({value: value, x: i, y: j});
  				}
  			}
  		}
  	}
  	return max;
  }

  //returns the value of the max tile
  maxTile() {
    let board = this.game.board;
  	return this.maxInfo()[0].value;
  }

  //returns the score of the max tile position (2 for corner and 1 for side)
  maxPosition() {
    let board = this.game.board;
  	let max = this.maxInfo();
  	let positions = [];
  	for (let i = 0; i < max.length; i++) {
      let { x, y } = max[i];
  		positions.push(this.positionScore([x, y]));
  	}
  	positions.sort(function(a, b) { return b - a; });
  	return positions[0] * positions[0];
  }

  //scores the position of the current tile (2 for corner and 1 for side)
  positionScore(cell) {
  	return cell.map(function(d) {
  		return Math.floor(((d - 1 + 4) % 4)/ 2);
  	}).reduce(function(a,b) {
  		return a + b;
  	});
  }

  //returns the chain score (higher when values are "chained" or in increasing
  //order for neighbors regardless of being in the same row/column
  chainScore() {
    let board = this.game.board;
  	let max = this.maxInfo();
  	let chains = [];
  	for (let i = 0; i < max.length; i++) {
  		let traversed = [];
  		chains.push(this.calcChain(max[i], traversed) / max[i].value, true);
  	}
  	chains.sort(function(a, b) { return b - a; });
  	return chains[0];
  }

  //recursive helper for chainScore
  calcChain(max, traversed, first) {
    let board = this.game.board;
    let neighbors = [];
  	let scores = [];
  	for (let i = max.x - 1; i < max.x + 2; i++) {
  		for (let j = i == max.x ? max.y - 1 : max.y; j < max.y + 2; j += 2) {
  			if (i >= 0 && i < board.length && j >= 0 && j < board[i].length) {
  				if (board[i][j])
  					neighbors.push([board[i][j], i, j]);
  			}
  		}
  	}
  	for (let i = 0; i < neighbors.length; i++) {
  		let travContains = traversed.indexOf(JSON.stringify(neighbors[i])) > -1;
  		traversed.push(JSON.stringify(neighbors[i]));
  		if (max.value == neighbors[i][0] * 2) {
  			scores[i] = max.value * (first ? 8 : 1)
  										+ this.calcChain(neighbors[i], traversed,  false);
  		} else if (max.value == neighbors[i][0] && !travContains) {
  			scores[i] = max.value * (first ? 8 : 1) * 4
  										+ this.calcChain(neighbors[i], traversed, false);
  		} else {
  			scores[i] = 0;
  		}
  	}
  	scores.sort(function(a, b) { return b - a; });
  	return scores[0];
  }
}

class Game {
  constructor({ board, score, gameWon, gameOver, lastMoveMade }) {
    this.board = board || this.generateNewBoard();
    this.score = score || 0;
    this.gameWon = gameWon != null ? gameWon : this.isGameWon();
    this.gameOver = gameOver != null ? gameOver : this.isGameOver();
    this.lastMoveMade = this.lastMoveMade || lastMoveMade;
  }

  gameState() {
    let { board, score, gameWon, gameOver, lastMoveMade } = this;
    return { board, score, gameWon, gameOver, lastMoveMade };
  }

  generateNewBoard() {
    this.board = [
      [0,0,0,0],
      [0,0,0,0],
      [0,0,0,0],
      [0,0,0,0]
    ];
    this.placeRandomTile();
    this.placeRandomTile();
    this.lastMoveMade = "game started";
    return this.board;
  }

  placeRandomTile() {
    let board = this.board;
    let hasEmpty = board.reduce(function(a, b) {
      return a.concat(b);
    }).indexOf(0) > -1;
    if (hasEmpty) {
      let random = Math.floor(Math.random() * 16);
      while(board[Math.floor(random / 4)][random % 4] !== 0) {
       random = Math.floor(Math.random() * 16);
      }
      board[Math.floor(random / 4)][random % 4] = Math.random() < 9 ? 2 : 4;
    }
  }

  clone() {
    let clone = new Game(this);
    clone.board = this.board.map(function(d) {
      return d.slice();
    });
    return clone;
  }

  isGameWon() {
    return this.board.reduce(function(a, b) {
      return a.concat(b)
    }).indexOf(2048) > -1;
  }

  isGameOver() {
    //temporarily changing gameOver to avoid circular function calls
    let gameOver = this.gameOver;
    this.gameOver = false;

    let clone = this.clone();


    this.gameOver = gameOver;

    if (clone.moveLeft()) return false;
    if (clone.moveRight()) return false;
    if (clone.moveDown()) return false;
    if (clone.moveUp()) return false;
    return true;
  }

  makeMove(direction) {
    let directions = ["up", "right", "down", "left"];
    let moves = [ this.moveUp, this.moveRight,this.moveDown, this.moveLeft ];
    if (!isNaN(parseInt(direction))) {
      direction = parseInt(direction);
    } else {
      direction = directions.indexOf(direction);
    }
    if (direction >= 0 && direction < 4) {
      let changed = moves[direction].call(this);
      if (changed) {
        this.lastMoveMade = directions[direction];
        this.updateGame();
      }
      return changed;
    }
    return false;
  }

  updateGame() {
    this.placeRandomTile();
    this.gameWon = this.isGameWon();
    this.gameOver = this.isGameOver();
  }

  moveLeft() {
    let board = this.board;
    let changed = false;
    for (let i = 0; i < board.length; i++) {
      for (let s = 0; s < 3; s++) {
    	  for (let j = 0; j < board[i].length - 1; j++) {
          let padding = 1;
    	    for (let k = j + 1; k < board[i].length; k++) {
    	      if (board[i][k] === 0) continue;
            if (board[i][j] === board[i][k]) {
              board[i][j] += board[i][k];
              board[i][k] = 0;
              padding++;
              this.score += board[i][j];
              changed = true;
            } else {
              if (board[i][j] === 0) {
                board[i][j] = board[i][k];
                board[i][k] = 0;
                changed = true;
              } else if (k > j + padding && board[i][j + padding] === 0) {
                board[i][j + 1] = board[i][k];
                board[i][k] = 0;
                changed = true;
              }
              k = board.length;
            }
          }
        }
      }
    }
    return changed;
  }

  rotateBoard() {
    let board = this.board;
    for (let layer = 0; layer < board.length / 2; ++layer) {
        let first = layer;
        let last = board.length - 1 - layer;
        for(let i = first; i < last; ++i) {
            let offset = i - first;
            let top = board[first][i];
            board[first][i] = board[last-offset][first];
            board[last-offset][first] = board[last][last - offset];
            board[last][last - offset] = board[i][last];
            board[i][last] = top;
        }
    }
  }

  moveRight() {
    let board = this.board;
    this.rotateBoard();
    this.rotateBoard();
    let changed = this.moveLeft();
    this.rotateBoard();
    this.rotateBoard();
    return changed;
  }

  moveDown() {
    let board = this.board;
    this.rotateBoard();
    let changed = this.moveLeft();
    this.rotateBoard();
    this.rotateBoard();
    this.rotateBoard();
    return changed;
  }

  moveUp() {
    let board = this.board;
    this.rotateBoard();
    this.rotateBoard();
    this.rotateBoard();
    let changed = this.moveLeft();
    this.rotateBoard();
    return changed;
  }
}
