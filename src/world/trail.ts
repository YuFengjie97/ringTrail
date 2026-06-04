import { abs, attribute, cameraPosition, Discard, dot, exp, float, Fn, fract, fwidth, hash, If, instanceIndex, max, min, mix, mx_noise_float, mx_noise_vec3, normalLocal, normalView, positionLocal, pow, rotate, sin, smoothstep, step, texture, time, transformedNormalView, transformedNormalWorld, transformNormal, uniform, uv, varying, vec3, vec4 } from "three/tsl"
import * as THREE from "three/webgpu"

import {scene} from '@/world/scene'
import { GLTFLoader } from "three/examples/jsm/Addons.js";

export default async function ringTrail(){
  const loader = new GLTFLoader();
  const gltf = await loader.loadAsync(import.meta.env.BASE_URL + 'model/ring.glb' );

  const COUNT = 1000
  const circleRadiusScale = uniform(.08)
  const extrusionStart = uniform(.02)
  const extrusionEnd = uniform(.2)
  const speedAmp = uniform(4)
  const gapScale = uniform(.1)
  const rotAngScale = uniform(.01)
  const rotAngOffsetSpeed = uniform(.1)
  const colSeed = uniform(new THREE.Vector3(3,2,1))
  const colSeedScale = uniform(.1)

  // @ts-ignore
  const geo = gltf.scene.children[0].geometry as unknown as THREE.BufferGeometry
  // const geo = new THREE.IcosahedronGeometry(10, 4)

  console.log(geo);

  const mat = new THREE.MeshBasicNodeMaterial()
  // mat.transparent = true
  // mat.side = THREE.DoubleSide
  // mat.metalness = 0
  // mat.roughness = .05
  // mat.opacity = 1
  // mat.thickness = 1.5
  // mat.ior = 1.5
  // mat.transmission = 1
  
  const factor = attribute<'float'>('_factor', 'float') // 圆弧曲线长度01
  const rPos = attribute<'vec3'>('_rpos', 'vec3')       // 基础圆环顶点位置
  const uvCustom = attribute<'vec2'>('_uv', 'vec2')

  const vRadius = varying(float(1))
  const vCol = varying(vec3(0))
  const vTransformedNormal = varying(vec3(0))
  const vIdx = varying(float(0))

  mat.positionNode = Fn(() => {
    const idx = float(instanceIndex)
    const idxSeed = idx.mul(.1)

    vIdx.assign(idx)


    const pl = positionLocal.toVar()

    /**
     * 放大圆环基础半径,本质是相对位移
     * 先算出点相对于原始位置的偏移
     * 然后放大原始位置(缩放基础半径)
     * 然后放大后的原始位置 + 相对位移
     */
    const offset = pl.sub(rPos)
    // const scale = sin(idx.mul(2.47).add(1.34)).mul(.5).add(.5).mul(3)
    const scale = idxSeed.mul(gapScale)
    const rPos2 = rPos.add(
      rPos.normalize().mul(scale)
    )
    pl.assign(rPos2.add(offset))


    /**
     * 其实不是挤出,而是缩小
     * 完整的圆环通过缩放轮廓曲线半径,配合discard来形成尖端拖尾
     * 因为blender中将轮廓曲线半径为0,会导致法向为001
     * 所以反其道行之,将其轮廓曲线半径为1,然后"缩小"
     */
    const radius = smoothstep(0., extrusionStart, factor)
                      .mul(smoothstep(extrusionEnd, 0., factor))
                      .mul(circleRadiusScale)
                      .oneMinus()

    const dir = normalLocal.mul(-1)
    const extrusion = dir.mul(radius)
    const pos = pl.add(extrusion)

    vRadius.assign(radius)

    const rotAng = vec3(
      sin(idxSeed.mul(rotAngScale).add(time.mul(rotAngOffsetSpeed))),
      sin(idxSeed.mul(rotAngScale).add(time.mul(rotAngOffsetSpeed))),
      sin(idxSeed.mul(rotAngScale).add(time.mul(rotAngOffsetSpeed)))
    ).mul(12)
    // const rotAng = mx_noise_vec3(idxSeed.mul(rotAngScale)).mul(6)

    const speed = mx_noise_float(idxSeed).mul(.5).add(.5).mul(speedAmp)
    rotAng.addAssign(vec3(0,0,time.mul(speed)))

    vCol.assign(
      sin(
        colSeed.
        add(idxSeed.mul(colSeedScale))
      ).mul(.5).add(.5)
    )


    let rotPos = rotate(pos, rotAng)
    // const rotAngWrap = mx_noise_vec3(idxSeed).mul(.1).mul(time)
    // rotPos = rotate(rotPos, rotAngWrap)


    let transformedNormal = rotate(normalLocal, rotAng)
    // transformedNormal = rotate(transformedNormal, rotAngWrap)

    vTransformedNormal.assign(transformedNormal)

    return rotPos
  })()

  mat.normalNode = Fn(() => {
    return vTransformedNormal.normalize()
  })()


  mat.colorNode = Fn(() => {
    If(vRadius.equal(1), () => {
      Discard()
    })
    // const cameraDir = cameraPosition.toVar().normalize()
    // const fresnel = pow(max(0, dot(vTransformedNormal.normalize(), cameraDir)).oneMinus(), 5)


    return vCol.mul(.1)
  })()

  // @ts-ignore
  mat.emissiveNode = Fn(() => {
    const line = max(.04, 
                      fract(uvCustom.x)
                    )
    const glow = pow(float(.1).div(line), 2)

    return vCol.mul(glow).mul(.4)
  })()


  const ins = new THREE.InstancedMesh(geo, mat, COUNT)


  scene.add(ins)
}