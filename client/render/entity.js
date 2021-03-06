import {interpolateProperty, isEntityOffScreen, shouldEntityBeFlipped, getFrameIndex} from '..'

export const renderEntity = function (entity) {

  const {state, isVehicle} = this
  const {camera, tick} = state

  const {
    id: entityId,
    drivingId,
    passengingId,
    direction,
    previousDirection,
    frameOffset,
    frames,
    speed
  } = entity || {}

  if (!entityId || drivingId || passengingId) return

  const entityX = interpolateProperty('x', entityId, state, isVehicle)
  const entityY = interpolateProperty('y', entityId, state, isVehicle)

  let xInCamera = entityX - camera.x

  const yInCamera = Math.round(entityY - camera.y)
  const isOffScreen = isEntityOffScreen({xInCamera, yInCamera, entity, camera})

  if (isOffScreen) return

  const frameIndex = frames && speed && getFrameIndex(frameOffset, tick)

  const id =
      frames && entityY < 7832 ? `${entity.elementId}-8`
    : frames && speed ? `${entity.elementId}-${frameIndex}`
    : entity.elementId

  const $entity = document.getElementById(id)
  const $camera = document.getElementById(camera.elementId)
  const context = $camera.getContext('2d')
  const shouldFlip = shouldEntityBeFlipped(direction, previousDirection)

  shouldFlip && context.scale(-1, 1)
  shouldFlip && (xInCamera = -entityX + camera.x - entity.width)
  xInCamera = Math.round(xInCamera)
  context.drawImage($entity, xInCamera, yInCamera)
  context.setTransform(1, 0, 0, 1, 0, 0)
}
