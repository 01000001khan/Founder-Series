// Consider reimplementing in Babylon.js, apparently it can look better and has superior AR support.

// IMPORTANT NOTE. Proper usage of the light maps is to multiply the background by (1. + lightIntensity * lightMap)
// I was not able to get this working with three.js, but this is absolutely necessary to get decent looking results.
// Additive is not physically correct and looks terrible compared to how it could. Please reimplement properly in
// babylon.js, or anything else really. Three.js is weird, it would be best not to waste time continuing to try 
// to make it work here.


import * as THREE from 'https://cdn.skypack.dev/three@0.129.0/build/three.module.js';
import { GLTFLoader } from 'https://cdn.skypack.dev/three@0.129.0/examples/jsm/loaders/GLTFLoader.js';
import { RGBELoader } from 'https://cdn.skypack.dev/three@0.129.0/examples/jsm/loaders/RGBELoader.js';



// Three.js stuff
const loader = new GLTFLoader();
const tloader = new THREE.TextureLoader();

let scene = new THREE.Scene();
let core = new THREE.Mesh();
let renderer = new THREE.WebGLRenderer({antialias:true});
scene.add(core);

// My variables
const slider = document.getElementById("slider");
let lastSliderPos = -1;
let dt = 0;
let time = 0;
let inposition = false;
let camera = null;
let mixer = null;
let speaker = null;
let anim = null;
let animAction = null;
let aspectRatio = 16/9;

renderer.setClearColor("#FFF");
renderer.setSize( slider.offsetWidth, slider.offsetWidth / aspectRatio );
renderer.setPixelRatio( window.devicePixelRatio );
renderer.toneMapping = THREE.AgXToneMapping; // Optimally I'd like to use a custom tonemapping config, specifically https://github.com/bean-mhm/grace
renderer.toneMappingExposure = 2;

window.renderer = renderer;
window.scene = scene;

// Light
const light = new THREE.HemisphereLight( "#fff", 0x080820, 2 );
scene.add( light );

new RGBELoader().load( './assets/textures/leadenhall.hdr', function ( texture ) { // Replace with a more neutral skybox
    texture.mapping = THREE.EquirectangularReflectionMapping;
    scene.environment = texture;
});

const vs = `
varying vec2 vUv;

void main() {
    vUv = uv;
    vec4 modelViewPosition = modelViewMatrix * vec4(position, 1.0);
    gl_Position = projectionMatrix * modelViewPosition;
}
`

const fs = `
uniform sampler2D tex;
varying vec2 vUv;

void main() {
    vec2 rUv = vUv;
    rUv.y = rUv.y * -1. + 1.; // UV y exported backwards??
    gl_FragColor = texture2D(tex, rUv)*.5; // Reduced intensity for additive. 
    // When multiplying, the background should be multiplied by 1 + map*lightStrength but hdr shader output is not supported :(
}
`

const lampu = {
    tex: {
        value: tloader.load('./assets/textures/lampDiffuse.png')
    }
};

const vaseu = {
    tex: {
        value: tloader.load('./assets/textures/vaseDiffuse.png')
    }
};

let lampLight = new THREE.ShaderMaterial({
    uniforms: lampu,
    vertexShader: vs,
    fragmentShader: fs,
    transparent:  true,
    blending:  THREE.AdditiveBlending, 
    // blendEquation:  THREE.AddEquation,
    // blendSrc:  THREE.DstColorFactor,
    // blendDst:  THREE.OneFactor,
});

let vaseLight = new THREE.ShaderMaterial({
    uniforms: vaseu,
    vertexShader: vs,
    fragmentShader: fs,
    transparent:  true,
    blending:  THREE.AdditiveBlending, 
    // blendEquation:  THREE.AddEquation,
    // blendSrc:  THREE.DstColorFactor,
    // blendDst:  THREE.OneFactor,
});


window.meshes=[]
loader.load( './assets/models/decor/decorC1 render quality.glb', ( gltf ) => {

    speaker = gltf.scene;
    mixer = new THREE.AnimationMixer(speaker);

    anim = gltf.animations[0];
    anim.optimize();
    animAction = mixer.clipAction(anim);
    animAction.play();
    
    speaker.traverse( (child) => {
        if (child.isMesh) {
            child.material.envMap = scene.environment;
            meshes.push(child);
            child.renderOrder = 10;
            


            if (child.name.includes("Plant")){
                // Sort all the foliage after the background
                child.renderOrder = 100;
            }

            if (child.name == "vase"){
                // And vase on top, though zwrite should work safely anyways given vase is full alpha
                child.renderOrder = 120;
                child.material = new THREE.MeshPhysicalMaterial({
                    color: child.material.color,
                    roughnessMap: child.material.roughnessMap,
                    transmission: 1,
                    thickness: 1,
                    envMap: child.material.envMap
                });
                console.log("Vase", child)
            }

            if (child.name == "screen"){ // TV Screen

                const video = document.getElementById("video");
                video.onloadeddata = () => { video.play(); };

                const videoTexture = new THREE.VideoTexture(video);
                videoTexture.encoding = THREE.sRGBEncoding;
                videoTexture.needsUpdate = true;
                const videoMaterial = new THREE.MeshStandardMaterial({
                    color: 0x0,
                    emissive: 0xffffff,
                    emissiveMap: videoTexture,
                    side: THREE.FrontSide,
                    emissiveIntensity: 1,
                    toneMapped: true,
                    roughness: 0,
                    envMap: child.material.envMap
                });
                videoMaterial.needsUpdate = true;
                child.material = videoMaterial;
                
                
                console.log("Screen", child);
                console.log("Texture", child.material.map);
            }

            if (child.name == "Bounce_Light"){
                child.renderOrder = 1;
                child.material = lampLight;
                console.log("Lamp Diffuse", child);
            }
            
            if (child.name == "Bounce_Light_Area"){
                child.renderOrder = 1;
                child.material = vaseLight;
                console.log("Vase Diffuse", child);
            }
            
        }
    });
    
    camera = gltf.cameras[0];
    camera.aspect = aspectRatio;
    
    scene.add(speaker);
    setWindow();
    render(0);

},undefined,function(error){console.error(error);});

let newframe = true;
// Recursive render Loop
function render(t) {
    
    requestAnimationFrame( render );    // Request the next frame before we've actually rendered
                                        // this one because js is weird and everything runs async.

    // dt = t*.001-time;
    // time = t*.001; // Seconds instead of ms
    
    // Consider adding reflection probe (cube camera in THREE) to the lamp, especially if reducing normal intensity or somethin'
    
    // Consider adding temporal antialiasing. Sample code here: 
    // https://git.ucsc.edu/jlao3/CMPM163Labs/-/blob/fc061ee35444d648b200a9a5fc83c32407a7c590/three.js-master/examples/webgl_postprocessing_taa.html
    // If !newframe, accumulate, otherwise render new frame
    

    //let newframe = animAction.time != slider.value; // Only render again when the slider moves and therefore scene has changed
    // Well now that the video is working, we'd better render it every frame. 
    newframe = true;


    if (camera){ // serves to make sure camera exists for render call, makes sure model is loaded and stuff initialized for DOM stuff
        if (newframe){
            setAnimTime(slider.value);
            renderer.render(scene, camera); // The actual render call
        }
    
        if (!inposition){
            document.getElementById("stuff").appendChild(renderer.domElement);
            inposition = true;
        }
    }
}

addEventListener("resize", setWindow);
function setWindow(){
    renderer.setSize( slider.offsetWidth, slider.offsetWidth / aspectRatio );
    camera.updateProjectionMatrix();
    console.log("rezised :P");
}

function setAnimTime(t){
    if ( mixer ){
        mixer.update( anim.duration + (t - animAction.time));
    }
}
