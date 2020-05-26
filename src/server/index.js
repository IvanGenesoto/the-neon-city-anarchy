import express, {static as static_} from 'express'
import {Server} from 'http'
import socketIo from 'socket.io'
import {join} from 'path'
import now from 'performance-now'
import {getDistrictKit} from './get-district-kit'
import {getEntityKit} from './get-entity-kit'
import {getPlayerKit} from './get-player-kit'

const app = express()
const server = Server(app)
const io = socketIo(server)
const port = process.env.PORT || 3000

const matchingKit = {
  characters: [],
  vehicles: [],
  checkedWalkers: [],
  matchesForCharacter: []
}

const collisionKitByType = {
  collisionKit: {vehiclesA: [], vehiclesB: []},
  interactionKit: {charactersA: [], charactersB: []}
}

const state = {
  tick: 0,
  fps: 30,
  connectionQueue: [],
  latencyQueue: [],
  inputQueue: [],
  delayKit: {},
  districtKit: getDistrictKit(),
  entityKit: getEntityKit(),
  playerKit: getPlayerKit(),
  matchingKit,
  collisionKitByType
}

const createMayor = function () {
  const {state} = this
  const {playerKit, entityKit, districtKit} = state
  const playerId = playerKit.create()
  const characterId = entityKit.create('character')
  const districtId = districtKit.create(true)
  playerKit.assignCharacter(playerId, characterId)
  entityKit.assignPlayer(characterId, playerId)
  entityKit.assignDistrict(characterId, districtId)
  return state
}

const initiateDistrict = function (characterCount, vehicleCount) {
  const {state} = this
  const {districtKit} = state
  const districtId = districtKit.create()
  populate.call(this, 'character', characterCount, districtId)
  populate.call(this, 'vehicle', vehicleCount, districtId)
  return state
}

const populate = function (entityType, count, districtId) {
  const {state} = this
  const {entityKit, districtKit} = state
  while (count) {
    const entityId = entityKit.create(entityType, districtId)
    const entity = entityKit.clone(entityId)
    districtKit.addToDistrict(entity)
    --count
  }
  return state
}

const handleConnection = function (socket) {
  const {state} = this
  const {connectionQueue} = state
  const wrappedPlayerId = {}
  connectionQueue.push({socket, wrappedPlayerId})
  socket.on('timestamp', handleTimestamp.bind({state, wrappedPlayerId}))
  socket.on('input', handleInput.bind({state, wrappedPlayerId}))
  return state
}

const handleTimestamp = function (timestamp) {
  const {state, wrappedPlayerId} = this
  const {latencyQueue} = state
  const newTimestamp = now()
  const latency = newTimestamp - timestamp
  latencyQueue.push({latency, wrappedPlayerId})
  return state
}

const handleInput = function (input) {
  const {state, wrappedPlayerId} = this
  const {inputQueue} = state
  inputQueue.push({input, wrappedPlayerId})
  return state
}

const refresh = function () {
  const {state} = this
  const {playerKit, entityKit, districtKit} = state
  const activeKit = {walkers: [], drivers: [], passengers: []}
  const tick = ++state.tick
  state.refreshStartTime = now()
  runQueues.call(this)
  const playerCharacterIds = playerKit.getPlayerCharacterIds()
  const playerCharacters = entityKit.cloneMultiple(playerCharacterIds)
  const {walkers, drivers, passengers} = playerCharacters.reduce(pushIfActive, activeKit)
  const walkerClones = entityKit.cloneMultiple(walkers)
  const {characters, vehicles} = districtKit.checkVehicleKeylessMatches(walkerClones)
  const vehicleEntryKit = entityKit.checkForVehicleEntries(characters, vehicles)
  const {charactersToEnter, vehiclesToBeEntered, nonEntereringWalkers} = vehicleEntryKit
  const puttedKit = entityKit.putCharactersInVehicles(charactersToEnter, vehiclesToBeEntered)
  const {charactersPutInVehicles, vehiclesCharactersWerePutIn, strandedWalkers} = puttedKit
  entityKit.exitVehicles(passengers)
  entityKit.exitVehicles(drivers)
  const characters_ = entityKit.cloneMultiple(drivers, nonEntereringWalkers, strandedWalkers)
  const characters__ = characters_.reduce(pushIfUnique.bind({}), [])
  districtKit.addToGrid(characters__)
  const {collisions, interactions} = districtKit.detectCollisions(characters__)
  if (collisions && collisions.length) var collidedVehicles = collideVehicles(collisions)
  if (interactions && interactions.length) var interacted = makeCharactersInteract(interactions)
  entityKit.cloneMultiple(
    charactersPutInVehicles, vehiclesCharactersWerePutIn, collidedVehicles, interacted
  )
  const playerCharacterIds_ = playerKit.getPlayerCharacterIds()
  const playerCharacters_ = entityKit.cloneMultiple(playerCharacterIds_)
  entityKit.cloneAll()
  const allPlayers = playerKit.cloneAll()
  updateActive.call(this, allPlayers)
  walkOrDrive.call(this, playerCharacters_, allPlayers)
  const allDistricts = districtKit.cloneAll()
  entityKit.updateLocations(allDistricts)
  if (tick % 3) return callRefresh.call(this) && state
  const latencyKits = playerKit.getLatencyKits()
  entityKit.updateLatencies(latencyKits)
  entityKit.emit(io)
  callRefresh.call(this)
  return state
}

const pushIfActive = (activeKit, character) => {
  const {walkers, drivers, passengers} = activeKit
  const {active, driving, passenging, id: characterId} = character
  if (active >= 30 && driving) (character.active = 0) || drivers.push(characterId)
  else if (active >= 30 && passenging) (character.active = 0) || passengers.push(characterId)
  else if (active >= 30) (character.active = 0) || walkers.push(characterId)
  return activeKit
}

const pushIfUnique = function (uniques, entity) {
  const entityById = this
  const {id} = entity
  const entity_ = entityById[id]
  if (entity_) return uniques
  entityById[id] = entity
  return uniques
}

function collideVehicles({vehiclesA, vehiclesB}) { // eslint-disable-line no-unused-vars
}

function makeCharactersInteract({charactersA, charactersB}) { // eslint-disable-line no-unused-vars
}

const updateActive = function (allPlayers) {
  const {state} = this
  const {entityKit} = state
  allPlayers.forEach(player => {
    const {id: playerId, input, character} = player
    if (!playerId) return
    if (input.action) entityKit.active(character)
    else entityKit.inactive(character)
    entityKit.clone(character)
  })
  return state
}

const walkOrDrive = function (playerCharacters, allPlayers) {
  const {state} = this
  const {entityKit} = state
  playerCharacters.forEach(character => {
    const {player, driving, passenging, id} = character
    const {input} = allPlayers[player]
    if (driving) entityKit.drive(id, input)
    else if (!passenging) entityKit.walk(id, input)
  })
  return state
}

const callRefresh = function () { // #refactor
  const {state} = this
  const {delayKit: _, fps} = state
  const millisecondsPerFrame = 1000 / fps
  const refreshWithThis = refresh.bind(this)
  if (!_.loopStartTime) _.loopStartTime = now() - millisecondsPerFrame
  if (!_.millisecondsAhead) _.millisecondsAhead = 0
  var refreshDuration = now() - state.refreshStartTime
  var loopDuration = now() - _.loopStartTime
  _.loopStartTime = now()
  var delayDuration = loopDuration - refreshDuration
  if (_.checkForSlowdown) {
    if (delayDuration > _.delay * 1.2) {
      _.slowdownCompensation = _.delay / delayDuration
      _.slowdownConfirmed = true
    }
  }
  _.millisecondsAhead += millisecondsPerFrame - loopDuration
  _.delay = millisecondsPerFrame + _.millisecondsAhead - refreshDuration
  clearTimeout(_.timeout)
  if (_.delay < 5) {
    _.checkForSlowdown = false
    refreshWithThis()
  }
  else {
    if (_.slowdownConfirmed) {
      _.delay = _.delay * _.slowdownCompensation
      if (_.delay < 14) {
        if (_.delay < 7) {
          refreshWithThis()
        }
        else {
          _.checkForSlowdown = true
          _.slowdownConfirmed = false
          _.timeout = setTimeout(refreshWithThis, 0)
        }
      }
      else {
        _.checkForSlowdown = true
        _.slowdownConfirmed = false
        var delay = Math.round(_.delay)
        _.timeout = setTimeout(refreshWithThis, delay - 2)
      }
    }
    else {
      _.checkForSlowdown = true
      delay = Math.round(_.delay - 2)
      _.timeout = setTimeout(refreshWithThis, delay)
    }
  }
  return state
}

const runQueues = function () {
  const {state} = this
  const {playerKit, connectionQueue, latencyQueue, inputQueue} = state
  const {updateLatencyBuffer, updateInput} = playerKit
  connectionQueue.forEach(initiatePlayer, this)
  latencyQueue.forEach(updateLatencyBuffer)
  inputQueue.forEach(updateInput, this)
  connectionQueue.length = 0
  latencyQueue.length = 0
  inputQueue.length = 0
  return state
}

const initiatePlayer = function ({socket, wrappedPlayerId}) {
  const {state} = this
  const {playerKit, districtKit, entityKit} = state
  const {id: socketId} = socket
  const playerId = wrappedPlayerId.playerId = playerKit.create(socketId)
  const districtId = districtKit.choose() || initiateDistrict.call({state})
  const districtIdString = districtId.toString()
  const characterId = entityKit.create('character', districtId)
  playerKit.assignCharacter(playerId, characterId)
  socket.join(districtIdString)
  entityKit.assignPlayer(characterId, playerId)
  const character = entityKit.clone(characterId)
  const {x: characterX} = character
  const vehicleX = getVehicleX(characterX)
  const configuration = {x: vehicleX, y: 7843, speed: 0}
  const vehicleId = entityKit.create('vehicle', districtId, configuration)
  entityKit.giveKey(characterId, vehicleId, true)
  const vehicle = entityKit.clone(vehicleId)
  districtKit.addToDistrict(character)
  districtKit.addToDistrict(vehicle)
  playerKit.emit(playerId, socket)
  districtKit.emit(districtId, socket)
  io.to(districtIdString).emit('entity', character)
  io.to(districtIdString).emit('entity', vehicle)
  return state
}

const getVehicleX = function (characterX) {
  const distance = Math.random() * (1000 - 200) + 200
  const sides = ['left', 'right']
  const random = Math.random()
  const index = Math.floor(random * sides.length)
  const side = sides[index]
  return side === 'left' ? characterX - distance : characterX + distance
}

createMayor.call({state})
initiateDistrict.call({state}, 20, 40)
io.on('connection', handleConnection.bind({state}))
app.use(static_(join(__dirname, 'public')))
server.listen(port, () => console.log('Listening on port ' + port))
refresh.call({state})
