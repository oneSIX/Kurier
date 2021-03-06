var _ = require('lodash'),
	express = require('express'),
	app = express(),
	bodyParser = require('body-parser'),
	Promise = require('bluebird'),
	MongoClient = require('mongodb').MongoClient,
	url = 'mongodb://adminuser:hunter12@ds119748.mlab.com:19748/kurier-db',
	// for local hosted DB below otherwise mlab hosted DB above
	// url = 'mongodb://localhost:27017/kurier',
	WebSocketServer = require('ws').Server,
	users = [],
	wss, db, usersdb, messagesdb;



//  username:  adminuser  password: hunter12
// mongodb://<dbuser>:<dbpassword>@ds119748.mlab.com:19748/kurier-db
function mongoConnect() {
	return new Promise(function(resolve, reject) {
		MongoClient.connect(url, function(err, ndb) {
			if (err == null) {
				db = ndb;
				usersdb = db.collection('users');
				messagesdb = db.collection('messages');

				if (usersdb && messagesdb) {
					console.log('Connected to MongoDB');
					resolve();
				} else {
					reject('Failed to Connect to MongoDB');
				}
			} else {
				reject(err);
			}
		});
	});
}

mongoConnect().then(function() {
	// Get Users
	getUsers().then(function(u) {
		_.each(u, function(user) {
			user.ws = [];
		});
		users = u;
	});



	// Websocket Stuff
	wss = new WebSocketServer({
		port: 8080
	});
	if (wss == null) {
		throw new Error('WS initialization failed');
	}
	console.log('WS Listening on 8080');

	wss.on('connection', function connection(ws) {
		var id = ws.upgradeReq.url.substring(1);
		console.log(ws.upgradeReq.url);

		var user = _.find(users, function(user) {
			return user._id == id;
		});

		if (!user) {
			ws.send(JSON.stringify({type:"error",content:"Not a valid user"}));
		} else {
			user.ws.push(ws);
			ws.send(JSON.stringify({type: "success", content: "you are connected"}));
			/*ws.on('message', function incoming(message) {
			  console.log('received: %s', message);
			  Promise.try(function(){
			    message = JSON.parse(message);
			    switch(message.type){
			      case 'message':
			        //TODO


			        break;
			      default:
			        throw new Error('Unknown message type');
			    }
			  }).catch(function(err){
			    console.log(err,err.stack);
			    ws.send('{type:"error",content:"'+err.message+'"}');
			  });
			});*/
			ws.on('close', function close() {
				console.log(id + ' disconnected');
				_.each(user.ws, function(w) {
					if (w === ws) {
						delete w;
					}
				});
			});
		}
	});

	// HTTP Stuff
	app.use(bodyParser.urlencoded({
		extended: false
	}));
	app.use(bodyParser.json());

	app.get('/', function(req, res) {
		res.send('Hello World!')
	});

	/****************************
	  Login to the App

	    body:
	      {name: 'string'}

	*****************************/
	app.post('/login', function(req, res) {
		Promise.try(function() {
			if (_.get(req, 'body.name', null) == null) {
				throw new Error('Name is required');
			}
			return getUserByName(req.body.name);
		}).then(function(user) {
			if (user) {
				return user;
			} else {
				return addUser({
					name: req.body.name,
					logged_in: true
				});
			}
		}).then(function(user) {
			res.status(200).send(JSON.stringify(user));
		}).catch(function(err) {
			console.log(err);
			res.status(500).send(err.message);
		});
	});

	/***************
	Post a message

	  body:
	    {to: *id*, from: *id*, message: 'string'}
	****************/
	app.post('/message/', function(req, res) {
		var message;
		Promise.try(function() {
			if (_.get(req, 'body.to', null) == null) {
				throw new Error('Sender (to) is required');
			}
			if (_.get(req, 'body.from', null) == null) {
				throw new Error('Receiver (from) is required');
			}
			if (_.get(req, 'body.message', null) == null) {
				throw new Error('Message (message) is required');
			}
			return Promise.all([
				getUserByID(req.body.to),
				getUserByID(req.body.from)
			]);
		}).spread(function(to, from) {
			if (!to && req.body.to != 0) {
				throw new Error('Sending User not Found');
			}
			if (!from) {
				throw new Error('Receiving User not Found');
			}

			message = {
				from: req.body.from,
				to: req.body.to,
				message: req.body.message
			};

			return addMessage(message);
		}).then(function() {
			// Find users (for ws connections)
			var fromUser = _.find(users, function(user) {
				return user._id == req.body.from;
			});
			var toUsers = _.filter(users, function(user) {
				return user._id == (req.body.to==0?user._id:req.body.to);
			});

			console.log(toUsers);

			message.type = 'message';

			// Publish via WS
			if(req.body.to != 0){
				_.each(fromUser.ws, function(ws) {
					try{
						ws.send(JSON.stringify(message));
					} catch (e){
						return;
					}
				});
			}
			_.each(toUsers, function(toUser){
				_.each(toUser.ws, function(ws) {
					try{
						ws.send(JSON.stringify(message));
					} catch (e){
						return;
					}
				});
			});

			return res.status(200).send('Message Sent');
		}).catch(function(err) {
			console.log(err);
			res.status(500).send(err.message);
		})
	});

	/************************
	  Get message history
	  - gets all messages sent to the particular user (for inital load of app)

	  param: user id
	  returns: JSON of threads (example below)
	    [{
	      from: 1
	      to: 2
	      messages: [ ... ]
	    }, ... ]
	************************/
	app.get('/history/:id', function(req, res) {
		Promise.try(function() {
			return Promise.all([
				getMessagesByReceiver(req.params.id),
				getMessagesBySender(req.params.id),
				getGlobalMessages()
			]);
		}).spread(function(recieved, sent, globalm) {
			var threads = [];
			_.each(recieved, function(message) {
				var thread = _.find(threads, function(thread) {
					return (thread.user == message.from);
				});

				if (thread) {
					thread.messages.push(message);
				} else {
					threads.push({
						user: message.from,
						messages: [message]
					});
				}
			});
			_.each(sent, function(message) {
				if(message.to != 0){
					var thread = _.find(threads, function(thread) {
						return (thread.user == message.to);
					});

					if (thread) {
						thread.messages.push(message);
					} else {
						threads.push({
							user: message.to,
							messages: [message]
						});
					}
				}
			});
			_.each(globalm, function(message) {
				var thread = _.find(threads, function(thread) {
					return (thread.user == 0);
				});

				if (thread) {
					thread.messages.push(message);
				} else {
					threads.push({
						user: 0,
						messages: [message]
					});
				}
			});
			res.json(threads);
		}).catch(function(err) {
			console.log(err);
			res.status(500).send(err.message);
		})
	});

	/**********************************
	  Get list of users

	  returns array of users (id, name)
	**********************************/
	app.get('/users/', function(req, res) {
		Promise.try(function() {
			var result = [];
			_.each(users, function(user) {
				result.push({
					_id: user._id,
					name: user.name
				});
			});
			res.json(result);
		}).catch(function(err) {
			console.log(err);
			res.status(500).send(err.message);
		});
	});

	app.get('/clearAll', function(req, res){
		usersdb.remove({});
		messagesdb.remove({});
		users = [];
		res.status(200).send('All Clear');
	});

	app.listen(3000, function() {
		console.log('HTTP Listening on 3000');
	});
}).catch(function(err) {
	console.log(err);
});


function addUser(user) {
	return new Promise(function(resolve, reject) {
		usersdb.insertOne(user, function(err, r) {
			if (err == null) {
				if (r.insertedCount === 1) {
					user.ws = [];
					users.push(user);
					console.log('New user added (' + user._id + ')')
					resolve(user);
				} else {
					reject('Error inserting user');
				}
			} else {
				reject(err);
			}
		});
	});
}

function setUserLoggedIn(user, state) {
	return new Promise(function(resolve, reject) {
		usersdb.findOneAndUpdate({
			_id: user._id
		}, {
			$set: {
				logged_in: state
			}
		}, function(err, r) {
			if (err == null) {
				if (r) {
					resolve(r);
				} else {
					reject('User not updated');
				}
			} else {
				reject(err);
			}
		});
	});
}

function getUserByID(id) {
	return new Promise(function(resolve, reject) {
		usersdb.find({
			_id: id
		}).toArray(function(err, user) {
			if (err == null) {
				resolve(user);
			} else {
				reject(err);
			}
		});
	});
}

function getUserByName(name) {
	return new Promise(function(resolve, reject) {
		usersdb.find({
			name
		}).toArray(function(err, user) {
			console.log(err, user);
			if (err == null) {
				resolve(user[0]);
			} else {
				reject(err);
			}
		});
	});
}

function getUsers() {
	return new Promise(function(resolve, reject) {
		usersdb.find().toArray(function(err, users) {
			if (err == null) {
				users = _.sortBy(users, ['name'], ['asc']);
				console.log(users);
				users.unshift({
					name:'Global',
					_id: 0,
					ws: []
				});
				console.log(users);
				resolve(users);
			} else {
				reject(err);
			}
		});
	})
}

function addMessage(message) {
	return new Promise(function(resolve, reject) {
		messagesdb.insertOne(message, function(err, r) {
			if (err == null) {
				if (r.insertedCount === 1) {
					console.log('New message added (' + message._id + ')')
					resolve();
				} else {
					reject('Error inserting message');
				}
			} else {
				reject(err);
			}
		});
	});
}

function getMessagesBySender(id) {
	return new Promise(function(resolve, reject) {
		messagesdb.find({
			from: id
		}).toArray(function(err, messages) {
			if (err == null) {
				messages = _.sortBy(messages, ['created_at'], ['asc']);
				resolve(messages);
			} else {
				reject(err);
			}
		});
	});
}

function getMessagesByReceiver(id) {
	return new Promise(function(resolve, reject) {
		messagesdb.find({
			to: id
		}).toArray(function(err, messages) {
			if (err == null) {
				messages = _.sortBy(messages, ['created_at'], ['asc']);
				resolve(messages);
			} else {
				reject(err);
			}
		});
	});
}

function getGlobalMessages() {
	return new Promise(function(resolve, reject) {
		messagesdb.find({
			to: 0
		}).toArray(function(err, messages) {
			if (err == null) {
				messages = _.sortBy(messages, ['created_at'], ['asc']);
				resolve(messages);
			} else {
				reject(err);
			}
		});
	});
}
