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
  $('#chat-input').submit(function(e) {
		e.preventDefault();

		var form = $(this);
		var msg = $("input[name=message]").val();

    if(activeUser_id || activeUser_id === 0){
      sendMsg(msg);
    }
	});
})

function sendMsg(msg) {
  $.ajax({
    type: 'POST',
		url: 'http://localhost:3000/message',
		contentType: 'application/json',
		data: JSON.stringify({
			from: user._id,
      to: activeUser_id,
      message: msg
		}),
    success: function(result){
      $('input[name=message]').val('');
      console.log(result.responseText);
    },
    error: function(result){
      console.log(result.responseText);
    }
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
				var data = JSON.parse(e.data);
        switch(data.type){
          case 'success':
            startChat();
            break;
          case 'message':
            console.log('New message from '+data.from);
						toast(data);
            var thread = _.find(threads,function(thread){
              console.log(data.to==0,thread.user==0,data.to == 0 && thread.user == 0);
              if(data.to == 0 && thread.user == 0){
                console.log('global thread: ',data)
                thread.messages.push(data);
                return true;
              } else if(data.to != 0 && thread.user == data.from){
                console.log('single thread: ',data)
                thread.messages.push(data);
                return true;
              }
              return false;
            });
            if(!thread){
              console.log('no thread: ',data)
              threads.push({
                user: (data.to==0?0:data.from),
                messages: [data]
              });
            }
            if(data.to == 0 && activeUser_id != 0){
              var unreadCount = $('.user[data-id="0"] .unreadCount');
              unreadCount.text(parseInt(unreadCount.text())+1);
            }else if(data.to != 0 && activeUser_id != data.from && data.from != user._id){
              var unreadCount = $('.user[data-id="'+data.from+'"] .unreadCount');
              unreadCount.text(parseInt(unreadCount.text())+1);
            }else if(data.to != 0 && activeUser_id == data.from){
              $('.user[data-id="'+data.from+'"]').click();
            }else if(activeUser_id == 0){
              $('.user[data-id="0"]').click();
            }
            break;
          default:
            console.log(data);
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
  var html = '';
  _.each(users, function(u){
    if(u._id != user._id){
      html+= '<div class="row user" data-id="'+u._id+'"><div class="col-md-4"><i class="fa fa-user"></i></div><div class="col-md-8">'+u.name+'<span class="unreadCount">0</span></div></div>';
    }
  })
  $('#user-window').html(html);
  $('.user').click(function(){
    $('#message-window .none').addClass('hidden');
    $('#message-window .loading').removeClass('hidden');
    $('#message-window .content').addClass('hidden');


    var box = $(this);
    activeUser_id= box.data('id');
    $('.user').removeClass('active');
    box.addClass('active');
    box.find('.unreadCount').text('0');


    //get messages and put them in the message window
    var thread = _.find(threads, function(thread){
      return thread.user == activeUser_id;
    });

    if(thread && thread.messages.length > 0){
      var html = '';
      _.each(thread.messages, function(message){
        html+='<div class="row"><div class="col-md-12">'+message.message+'</div></div>';
      });
      $('#message-window .content').html(html);

      $('#message-window .none').addClass('hidden');
      $('#message-window .loading').addClass('hidden');
      $('#message-window .content').removeClass('hidden');
    }else{
      $('#message-window .none').removeClass('hidden');
      $('#message-window .loading').addClass('hidden');
      $('#message-window .content').addClass('hidden');
    }


  });
  $('#login-container').addClass("hidden");
  $('#main-window').removeClass("hidden");
}

function toast(data){
	console.log('From: ' + data.from + '<br>');
	var ipc = require("electron").ipcRenderer;
	var msg = {
			title : 'New Message',
			message : 'From: ' + data.from + '<br>',
			detail : "",
			width : 440,
			// height : 160, window will be autosized
			timeout : 6000,
			focus: true // set focus back to main window
	};
	ipc.send('electron-toaster-message', msg);
}
