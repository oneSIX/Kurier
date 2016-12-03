// pass login request to Server -- returns ID used to login
var user;
var ws;

$(function(){
  $('#login').submit(function(e){
    e.preventDefault();

    var form = $(this);
    var username = $("input[name=username]").val();
    console.log(username);
    login(username);
  });
})


function login(userName){
console.log(userName);  
  $.ajax({
    type: 'POST',
    url: 'http://localhost:3000/login',
    contentType: 'application/json',
    data: JSON.stringify({name: userName}),
    success: function(result){
      console.log(result)
      user = JSON.parse(result)
      ws = new WebSocket('ws://localhost:8080/'+user._id);
    },
    error: function(result){
      console.log(result.responseText)
    }
});
}
