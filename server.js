'use strict';
const express = require('express');
const SocketServer = require('ws').Server;
const path = require('path');

const PORT = process.env.PORT || 3000;
const INDEX = path.join(__dirname, 'index.html');

const server = express()
                   .use((req, res) => res.sendFile(INDEX))
                   .listen(PORT, () => console.log(`Listening on ${PORT}`));

const wss = new SocketServer({server});
const config = {
  chans: {0: {sstates: []}},
  users: {0: {}},
  names: {}
};

const deliver = (message, chanId, targetId) => {
  for (let client of wss.clients) {
    if ((targetId && client.id === targetId) ||
        (!targetId && config.users[client.id].chan === chanId)) {
      client.send(message);
      if (targetId) {
        return;
      }
    }
  }
};
const whisper = message => deliver(JSON.stringify(message));

const broadcast = (message, user) => {
  deliver(JSON.stringify({message: `${user.name || user.id}: ${message}`}), user.chan);
};

const updateState = (state, user) => {
  config.chans[user.chan].sstates.push(state);
  deliver(JSON.stringify({state, user}), user.chan);
};

wss.on('connection', ws => {
  const heartbeat = () => ws.send(JSON.stringify({heartbeat: true}));
  setInterval(heartbeat, 1000);

  ws.on('message', data => {
    data = JSON.parse(data);
    const {message, method, state, target} = data;

    console.log(data);
    switch (method) {
      case 'init': {
        const id =
            data.user && data.user.id ? data.user.id : new Date().valueOf();
        ws.id = id;
        const user = data.user || config.users[id] || {};
        user.chan = user.chan || 0;
        user.id = id;
        config.users[id] = user;

        ws.send(JSON.stringify({
          server: `Connected as ${user.name ? user.name : ''}(${
              user.id}) to Channel: ${user.chan}.`,
          user
        }));

        if (!config.chans[user.chan]) {
          config.chans[user.chan] = {sstates: []};
          ws.send(JSON.stringify({server: `Created Channel ${user.chan}`}));
        } else {
          broadcast(`has joined!`, user);
        }
        break;
      }
      case 'name': {
        const name = data.message;
        config.users[ws.id].name = name;
        const user = config.users[ws.id];
        ws.send(JSON.stringify({server: `Changed name to ${user.name}`, user}));
        break;
      }
      case 'whisper': {
        const user = config.users[ws.id];
        const tid = config.names[target] || target;
        if (config.users[tid]) {
          deliver(
              JSON.stringify({
                id: user.id,
                name: user.name || user.id,
                message,
                whisper: true
              }),
              user, tid);
        } else {
          ws.send(JSON.stringify({server: `${tid} is not a valid user.`}));
        }
        break;
      }
      case 'state': {
        const user = config.users[ws.id];
        updateState(state, user);
        break;
      }
      default: {
        const user = config.users[ws.id];
        broadcast(message, user);
      }
    }
  });
});
