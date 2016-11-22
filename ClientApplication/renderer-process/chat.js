




// todo need to implement username and server info
var ws = new WebSocket('ws://hardcore.com:8080', 'echo-protocol');

function sendMessage(){
    var message = document.getElementById('message').value;
    ws.send(message);
}

ws.addEventListener("message", function(e){
    var msg = e.data;

    document.getElementById('chatlog').innerHTML += '<br>' + msg;
});