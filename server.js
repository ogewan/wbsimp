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
  chans: {'0': {state: false}},
  users: {},
  name2Id: {}
};
const history = {
  users: {},
  chans: {},
  raw: []
};

const deliver = (message, chanId, targetId) => {
  for (let client of wss.clients) {
    if ((targetId && client.id === targetId) ||
        (chanId && config.users[client.id].chan[chanId]) ||
        !chanId) { /* This is a bit of a hack. If not chatId is passed, 
          broadcast is called from init. As channel '0' is default, 
          everyone is notified via this channel. 
          Mutli channel broadcast will need to be implemented if a default channel d.n.e. #TODO:*/
      client.send(message);
      if (targetId) {
        return;
      }
    }
  }
};

const broadcast = (time, message, user, chan, targetId, forget) => {
  const post = {
    time,
    message: `${user.name || user.id}: ${message}`
  }
  if (targetId) {
    post.whisper = true;
  }
  if (!forget) {
    const index = history.raw.length;
    const archived = {...post, from: user.id};
    history.raw.push(archived);
    history.users[user.id] = history.users[user.id] || [];
    history.users[user.id].push(index);
    history.chans[chan || '0'] = history.chans[chan || '0'] || [];
    history.chans[chan || '0'].push(index);
  }
  deliver(JSON.stringify(post), chan, targetId);
};

// wrapper around broadcast because I dont feel like doing this properly
const broadcast_s = (time, message, user, chan, targetId) => broadcast(time, message, user, chan, targetId, true)

const updateState = (time, state, user, chan) => {
  let channel = config.chans[chan];
  if (channel.sstates) {
    channel.sstates.push(state);
    deliver(JSON.stringify({time, state, user}), chan);
  }
  else {
    ws.send(JSON.stringify({error: `Channel ${channel} is not ready for state`}));
  }
};

wss.on('connection', ws => {
  const heartbeat = () => ws.send(JSON.stringify({heartbeat: true}));
  setInterval(heartbeat, 1000);

  ws.on('message', data => {
    data = JSON.parse(data);
    let {method} = data;
    const {message, state, target, chan} = data;
    const time = (new Date()).valueOf();

    console.log(data);
    if (!method) {method = 'message';}
    switch (method) {
      case 'init': {
        const id =
            data.user && data.user.id ? data.user.id : new Date().valueOf();
        ws.id = id;
        const user = data.user || config.users[id] || {};
        user.chan = user.chan || {'0': true};
        if (typeof user.chan !== 'object' || !user.chan['0']) {
          user.chan = {'0': true};
        }
        user.id = id;
        config.users[id] = user;

        for (let ch in user.chan) {
          if (!config.chans[ch]) {
            config.chans[ch] = {state: true};
            ws.send(JSON.stringify({server: `Created Channel ${ch}`}));
          } else {
            broadcast_s(time, `has joined!`, user);
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
        if (message === '0') {
          ws.send(JSON.stringify({server: `Channel ${message} is read-only.`}));
        }
        else if (config.users[ws.id].chan[message]) {
          ws.send(JSON.stringify({server: `${user.name ? user.name : ''}(${user.id}) is already member of Channel ${user.chan}.`}));
        }
        else {
          config.users[ws.id].chan[message] = true;
          ws.send(JSON.stringify({
            server: `Connected as ${user.name ? user.name : ''}(${
                user.id}) to Channel ${message}.`,
            user
          }));
          if (!config.chans[message]) {
            config.chans[message] = {state: true};
            ws.send(JSON.stringify({server: `Created Channel ${message}.`}));
          } else {
            broadcast_s(time, `has joined!`, user, message);
          }
          break;
        }
      }
      case 'leave': {
        const user = config.users[ws.id];
        if (!config.chans[message]) {
          ws.send(JSON.stringify({server: `Channel ${message} does not exist.`}));
        }
        else if (message === '0') {
          ws.send(JSON.stringify({server: `Channel ${message} cannot be left.`}));
        }
        else if (!user.chan[message]) {
          ws.send(JSON.stringify({server: `${user.name ? user.name : ''}(${user.id}) is not a member of Channel ${user.chan}.`}));
        }
        else {
          delete config.users[ws.id].chan[message];
          ws.send(JSON.stringify({
            server: `Left Channel ${message}.`,
            user
          }));
          broadcast_s(time, `has left!`, user);
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
          broadcast(time, message, user, '', tid)
        } else {
          ws.send(JSON.stringify({server: `${tid} is not a valid user.`}));
        }
        break;
      }
      case 'state': {
        const user = config.users[ws.id];
        if (state) {
          updateState(time, state, user, chan);
        }
        else {
          if (!config.chans[chan].state) {
            ws.send(JSON.stringify({server: `Channel ${chan} does not accept state.`}));
          }
          else {
            config.chans[chan].sstates = [];
            ws.send(JSON.stringify({server: `Channel ${chan} is now ready to accept state.`}));
          }
        }
        break;
      }
      case 'message': {
        const user = config.users[ws.id];
        broadcast(time, message, user, chan);
        break;
      }
      default: {
        ws.send(JSON.stringify({server: `${method} is not a valid command.`}));
      }
    }
  });
});
