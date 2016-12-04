// pass login request to Server -- returns ID used to login
var user;
var activeUser_id = null;
var ws;

var users = [];
var threads = [];
var _ = require('lodash')

$(function() {
	$('#login').submit(function(e) {
		e.preventDefault();

		var form = $(this);
		var username = $("input[name=username]").val();

		login(username);
	});
  $('#message-box').submit(function(e) {
		e.preventDefault();

		var form = $(this);
		var msg = $("input[name=message]").val();

		sendMsg(msg);
	});
})

function sendMsg(msg) {
  $.ajax({
    type: 'POST',
		url: 'http://localhost:3000/login',
		contentType: 'application/json',
		data: JSON.stringify({
			from: user._id,
      to: toUser._id,
      message: msg
		}),
  })
}

function login(userName) {

	$.ajax({
		type: 'POST',
		url: 'http://localhost:3000/login',
		contentType: 'application/json',
		data: JSON.stringify({
			name: userName
		}),
		success: function(result) {
			console.log(result)
			user = JSON.parse(result)
			ws = new WebSocket('ws://localhost:8080/' + user._id);
			ws.onmessage = function(e) {
				console.log(e.data);
				var data = JSON.parse(e.data);
				console.log(data);
				if (data.type == "success") {
					startChat();
				}
			}
		},
		error: function(result) {
			console.log(result.responseText)
		}
	});
}

function startChat() {
	$("#login").addClass("hidden");
	$("#loading").removeClass("hidden");
	$.ajax({
		type: 'GET',
		url: 'http://localhost:3000/users',
		success: function(result) {
			users = result
			$.ajax({
				type: 'GET',
				url: 'http://localhost:3000/history/' + user._id,
				success: function(result) {
					threads = result
					showChat();
				},
				error: function(result) {
					console.log(result.responseText)
				}
			});
		},
		error: function(result) {
			console.log(result.responseText)
		}
	});
}

function showChat() {
	console.log(users, threads);
  var html = '';
  _.each(users, function(user){
    html+= '<div class="row user" data-id="'+user._id+'"><div class="col-md-4"><i class="fa fa-user"></i></div><div class="col-md-8">'+user.name+'</div></div>';
  })
  $('#user-window').html(html);
  $('.user').click(function(){
    var box = $(this);
    activeUser_id= box.data('id');
    $('.user').removeClass('active');
    box.addClass('active');
  })
  $('#login-container').addClass("hidden");
  $('#main-window').removeClass("hidden");
}
