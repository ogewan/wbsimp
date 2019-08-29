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
  chans: {0: {state: false}},
  users: {},
  name2Id: {}
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

const broadcast = (message, user, targetId) => {
  deliver(
      JSON.stringify({
        message: `${user.name || user.id}: ${message}`,
        whisper: (targetId) ? true : void (0)
      }),
      user.chan, targetId);
};

const updateState = (state, user) => {
  for (let chan of user.chan) {
    let channel = config.chans[chan];
    if (channel.sstates) {
      channel.sstates.push(state);
    }
    else if (channel.state) {
      channel.sstates = [state];
    }
  }
  deliver(JSON.stringify({state, user}), user.chan);
};

wss.on('connection', ws => {
  const heartbeat = () => ws.send(JSON.stringify({heartbeat: true}));
  setInterval(heartbeat, 1000);

  ws.on('message', data => {
    data = JSON.parse(data);
    let {method} = data;
    const {message, state, target, chan} = data;

    // console.log(data);
    if (!method) {method = 'message';}
    switch (method) {
      case 'init': {
        const id =
            data.user && data.user.id ? data.user.id : new Date().valueOf();
        ws.id = id;
        const user = data.user || config.users[id] || {};
        user.chan = user.chan || {0: true};
        if (typeof user.chan !== 'object' || !user.chan[0]) {
          user.chan = {0: true};
        }
        user.id = id;
        config.users[id] = user;

        for (let ch of user.chan) {
          if (!config.chans[ch]) {
            config.chans[ch] = {state: true};
            ws.send(JSON.stringify({server: `Created Channel ${ch}`}));
          } else {
            broadcast(`has joined!`, user);
          }
        }

        ws.send(JSON.stringify({
          server: `Connected as ${user.name ? user.name : ''}(${
              user.id}) to Channels: [${Array.from(Object.keys(user.chan))}].`,
          user
        }));
        break;
      }
      case 'channel': {
        const user = config.users[ws.id];
        config.users[ws.id].chan = message;
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
        if (config.name2Id[name]) {
          const other = config.users[config.name2Id[name]];
          const user = config.users[ws.id];

          if (ws.id === other.id) {
            ws.send(JSON.stringify({server: `Name is already ${user.name}`}));
          } else {
            ws.send(JSON.stringify(
                {server: `User (${other.id}) already has the name: ${name}`}));
          }
        } else {
          const user = config.users[ws.id];
          const oldName = user.name;
          config.users[ws.id].name = name;
          delete config.name2Id[oldName];
          ws.send(
              JSON.stringify({server: `Changed name to ${user.name}`, user}));
        }
        break;
      }
      case 'whisper': {
        const user = config.users[ws.id];
        const other = config.users[target];
        // ID > name, if a user A's nick is user B's ID, send to user B, else
        // send to user A
        const tid = (other) ? other.id : config.name2Id[target] || target;
        if (config.users[tid]) {
          broadcast(message, user, tid)
        } else {
          ws.send(JSON.stringify({server: `${tid} is not a valid user.`}));
        }
        break;
      }
      case 'state': {
        const user = config.users[ws.id];
        if (state) {
          updateState(state, user);
        }
        else {
        }
        break;
      }
      case 'message': {
        const user = config.users[ws.id];
        broadcast(message, user);
        break;
      }
      default: {
        ws.send(JSON.stringify({server: `${method} is not a valid command.`}));
      }
    }
  });
});
