'use latest';
import express from 'express';
import Webtask from 'webtask-tools';
import { MongoClient, ObjectID } from 'mongodb';
import bodyParser from 'body-parser';

const collection = 'sessions';
const server = express();

server.use(bodyParser.json());

server.get('/new', (req, res, next) => {
  const { MONGO_URL } = req.webtaskContext.data;

  let game = new Game({});
  let gameState = game.gameState();
  gameState.createdAt = new Date();

  MongoClient.connect(MONGO_URL, (err, db) => {
    if (err) return next(err);
    db.collection(collection).insertOne(gameState, (err, result) => {
      db.close();
      if (err) return next(err);
      res.status(200).send(gameState);
    });
  });
});

server.get('/:_id/', (req, res, next) => {
  const { _id } = req.params;
  const { MONGO_URL } = req.webtaskContext.data;
  MongoClient.connect(MONGO_URL, (err, db) => {
    if (err) return next(err);
    db.collection(collection).findOne({ _id : new ObjectID(_id) }, (err, result) => {
      db.close();
      if (err) return next(err);
      res.status(200).send(result);
    });
  });
});

server.get('/:_id/:direction', (req, res, next) => {
  const { _id, direction } = req.params;
  const { MONGO_URL } = req.webtaskContext.data;
  MongoClient.connect(MONGO_URL, (err, db) => {
    if (err) return next(err);
    db.collection(collection).findOne({ _id : new ObjectID(_id) }, (err, result) => {
      if (err) return next(err);

      if (result == null) {
        res.status(404).send("This game session has expired");
      } else if (!result.gameOver) {
        let game = new Game(result);
        game.makeMove(direction);
        let gameState = game.gameState();
        gameState.createdAt = new Date();
        db.collection(collection).update({ _id: result._id }, gameState, (err, result) => {
            if (err) return next(err);
            res.status(200).send(gameState);
        });
      } else {
        res.status(200).send(result);
      }
      db.close();
    });
  });
});

server.get('/*', (req, res, next) => {
  res.status(200).send("Use /new for a new game session and /[id]/[direction] to make moves");
});

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

module.exports = Webtask.fromExpress(server);
