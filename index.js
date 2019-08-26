// Make the DIV element draggable:
dragElement(document.getElementById('chat'));

function dragElement(elmnt) {
  var pos1 = 0, pos2 = 0, pos3 = 0, pos4 = 0;
  if (document.getElementById(elmnt.id + 'header')) {
    // if present, the header is where you move the DIV from:
    document.getElementById(elmnt.id + 'header').onmousedown = dragMouseDown;
  } else {
    // otherwise, move the DIV from anywhere inside the DIV:
    elmnt.onmousedown = dragMouseDown;
  }

  function dragMouseDown(e) {
    e = e || window.event;
    e.preventDefault();
    // get the mouse cursor position at startup:
    pos3 = e.clientX;
    pos4 = e.clientY;
    document.onmouseup = closeDragElement;
    // call a function whenever the cursor moves:
    document.onmousemove = elementDrag;
  }

  function elementDrag(e) {
    e = e || window.event;
    e.preventDefault();
    // calculate the new cursor position:
    pos1 = pos3 - e.clientX;
    pos2 = pos4 - e.clientY;
    pos3 = e.clientX;
    pos4 = e.clientY;
    // set the element's new position:
    elmnt.style.top = (elmnt.offsetTop - pos2) + 'px';
    elmnt.style.left = (elmnt.offsetLeft - pos1) + 'px';
  }

  function closeDragElement() {
    // stop moving when mouse button is released:
    document.onmouseup = null;
    document.onmousemove = null;
  }
}

// const WebSocket = require('isomorphic-ws');

const display = document.querySelector('#display');
const input = document.querySelector('#input');
//const ws = new WebSocket('ws://localhost:8081');
const ws = new WebSocket('ws://seungissues-wbsimp-test2.herokuapp.com:8080');
let user;
ws.on = ws.addEventListener;

ws.on('open', () => {
  const raw = localStorage.getItem('wbsUser');
  user = raw ? JSON.parse(raw) : void (0);
  ws.send(JSON.stringify({method: 'init', user}));
});

ws.on('message', (pack) => {
  const data = JSON.parse(pack.data);
  if (data.state) {
    // state negotiation
  } else {
    display.textContent += `\n${data.message || data.server}`;
    if (data.server && data.user) {
      user = data.user;
      localStorage.setItem('wbsUser', JSON.stringify(user));
    }
  }
});

input.addEventListener('keyup', (e) => {
  if (e.code === 'Enter') {
    let message = input.value; 
    let method;
    if (message.length && message[0] === '\\') {
      message = message.split('');
      method = message.splice(0, message.indexOf(' '));
      message.shift()
      method.shift()
      method = method.join('');
      message = message.join('');
    }
    ws.send(JSON.stringify({message, method}));
    input.value = '';
  }
})