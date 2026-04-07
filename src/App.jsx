import React, { useState, useEffect, useRef } from 'react';
import { 
  Box, 
  Rotate3D, 
  MessageSquareText, 
  BookOpen, 
  Play,
  Pause,
  RefreshCcw,
  Send,
  Wrench,
  Sparkles,
  Lightbulb,
  BrainCircuit,
  CheckCircle2,
  Circle,
  MousePointerClick
} from 'lucide-react';

// --- 数据字典与配置 ---
const STRUCTURES = [
  {
    id: 'zhisun',
    name: '基础直榫 (透榫)',
    desc: '透榫是榫卯中最经典、最基础的结构。下方的立柱顶端做成凸出的“榫头”，上方的横梁中间开出穿透的“卯眼”。两者插接后，能有效限制横梁在水平面上的移动。',
    history: '早在七千多年前的河姆渡文化遗址中，先民们就已经熟练使用这种结构建造干阑式房屋。',
    features: ['穿透卯眼', '结构稳固', '经典基础'],
    animAxis: 'y',    
    animTarget: 4     
  },
  {
    id: 'yanweisun',
    name: '燕尾榫 (滑动榫/槽榫)',
    desc: '燕尾榫是抗拉力极强的一种结构。榫头截面呈倒梯形（上宽下窄），形似燕尾。卯眼开出相匹配的梯形槽。两者只能沿着特定的方向推入，拼合后在垂直和侧向受力时会被完全锁死，无法拔出。',
    history: '明清古典家具中被广泛应用，是箱柜抽屉、无缝拼接面板的核心工艺，被誉为“万榫之母”。',
    features: ['抗拉力强', '梯形锁定', '单向组装'],
    animAxis: 'z',    
    animTarget: 7     
  }
];

const INITIAL_CHAT = [
  { sender: 'ai', text: '你好！我是由通义千问大模型驱动的“榫卯视界”智能伴学助手。你现在可以问我任何关于传统建筑、木作工艺或力学原理的问题了！' }
];

const SANDBOX_PARTS = [
  { id: 'leg_fl', name: '左前腿', init: [-3.5, 0, 0.5], target: [-1.4, 0, 1.4] },
  { id: 'leg_fr', name: '右前腿', init: [1.5, 0, -3.5], target: [1.4, 0, 1.4] },
  { id: 'leg_bl', name: '左后腿', init: [-2.5, 0, -3.5], target: [-1.4, 0, -1.4] },
  { id: 'leg_br', name: '右后腿', init: [-0.5, 0, -4.5], target: [1.4, 0, -1.4] }
];

const callLLMAPI = async (prompt, systemPrompt) => {

  const url = "/api/chat"; 
  
  const maxRetries = 5;
  const delays = [1000, 2000, 4000, 8000, 16000];

  for (let i = 0; i < maxRetries; i++) {
    try {
      const res = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ prompt, systemPrompt })
      });
      
      if (!res.ok) throw new Error(`HTTP error! status: ${res.status}`);
      const data = await res.json();
      return data.reply || "暂无回复内容";
      
    } catch (err) {
      if (i === maxRetries - 1) {
        console.error("大模型接口调用失败:", err);
        return "抱歉，我的云端大脑似乎断开连接了，请检查网络。";
      }
      await new Promise(resolve => setTimeout(resolve, delays[i]));
    }
  }
};

export default function App() {
  const [activeTab, setActiveTab] = useState('3d'); 
  const [activeStructure, setActiveStructure] = useState(STRUCTURES[0]);
  const [assemblyProgress, setAssemblyProgress] = useState(100); 
  const [autoRotate, setAutoRotate] = useState(true);
  const [engineLoaded, setEngineLoaded] = useState(false);

  const [sandboxScore, setSandboxScore] = useState(0);
  const [snappedParts, setSnappedParts] = useState({});
  const sandboxTriggerRef = useRef(null); 

  const [aiContent, setAiContent] = useState('');
  const [aiContentType, setAiContentType] = useState(''); 
  const [isGeneratingAiContent, setIsGeneratingAiContent] = useState(false);

  const mountRef = useRef(null);
  const threeState = useRef({
    scene: null, camera: null, renderer: null, masterGroup: null, 
    groupA: null, groupB: null, reqId: null, targetVal: 0, animAxis: 'y',
    draggableObjects: [], isDraggingSandbox: false, controls: null
  });

  useEffect(() => {
    sandboxTriggerRef.current = (partId) => {
      setSnappedParts(prev => {
        const next = { ...prev, [partId]: true };
        setSandboxScore(Object.values(next).filter(Boolean).length);
        return next;
      });
    };
  }, []);

  const handleListClick = (partId) => {
    if (snappedParts[partId]) return; 
    
    if (sandboxTriggerRef.current) sandboxTriggerRef.current(partId);

    const obj = threeState.current.draggableObjects.find(o => o.userData.id === partId);
    if (obj) {
      obj.userData.snapped = true;
      obj.children.forEach(c => {
        if (c.material) c.material.emissive.setHex(0x000000);
      });
    }
  };

  useEffect(() => {
    if (activeTab === 'sandbox') {
      setSandboxScore(0);
      setSnappedParts({});
      setAutoRotate(false); 
    } else {
      setAutoRotate(true);
    }
  }, [activeTab]);

  useEffect(() => {
    const loadScript = (src) => {
      return new Promise((resolve, reject) => {
        const script = document.createElement('script');
        script.src = src;
        script.onload = resolve;
        script.onerror = reject;
        document.head.appendChild(script);
      });
    };

    const initEngine = async () => {
      try {
        if (!window.THREE) {
          await loadScript("https://cdnjs.cloudflare.com/ajax/libs/three.js/r128/three.min.js");
        }
        if (!window.THREE.OrbitControls) {
          await loadScript("https://cdn.jsdelivr.net/npm/three@0.128.0/examples/js/controls/OrbitControls.js");
        }
        setEngineLoaded(true);
      } catch (e) {
        console.error("3D 引擎加载失败", e);
      }
    };
    initEngine();
  }, []);

  useEffect(() => {
    setAssemblyProgress(100);
    setAiContent(''); 
    setAiContentType('');
  }, [activeStructure]);

  useEffect(() => {
    threeState.current.targetVal = activeStructure.animTarget * (1 - assemblyProgress / 100);
    threeState.current.animAxis = activeStructure.animAxis;
  }, [assemblyProgress, activeStructure]);

  // --- 核心 3D 渲染引擎 ---
  useEffect(() => {
    if (!engineLoaded) return;
    const THREE = window.THREE;
    if (!mountRef.current) return;

    if (threeState.current.reqId) cancelAnimationFrame(threeState.current.reqId);
    if (threeState.current.renderer && mountRef.current.contains(threeState.current.renderer.domElement)) {
      mountRef.current.removeChild(threeState.current.renderer.domElement);
    }

    const width = mountRef.current.clientWidth;
    const height = mountRef.current.clientHeight;
    
    const scene = new THREE.Scene();
    scene.background = new THREE.Color(0xF9F6F0); 

    const camera = new THREE.PerspectiveCamera(45, width / height, 0.1, 100);
    
    const renderer = new THREE.WebGLRenderer({ antialias: true });
    renderer.setSize(width, height);
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    mountRef.current.appendChild(renderer.domElement);

    const controls = new THREE.OrbitControls(camera, renderer.domElement);
    controls.enableDamping = true; 
    controls.dampingFactor = 0.05;

    const ambientLight = new THREE.AmbientLight(0xffffff, 0.6);
    scene.add(ambientLight);
    const dirLight = new THREE.DirectionalLight(0xfff0dd, 0.9);
    dirLight.position.set(10, 20, 10);
    dirLight.castShadow = true;
    dirLight.shadow.mapSize.width = 1024;
    dirLight.shadow.mapSize.height = 1024;
    scene.add(dirLight);
    const backLight = new THREE.DirectionalLight(0xddeeff, 0.4);
    backLight.position.set(-10, 10, -10);
    scene.add(backLight);

    const masterGroup = new THREE.Group();
    scene.add(masterGroup);

    const woodMatTop = new THREE.MeshStandardMaterial({ 
      color: 0xD18B5E, roughness: 0.8,
      polygonOffset: true, polygonOffsetFactor: 1, polygonOffsetUnits: 1 
    });
    const woodMatBottom = new THREE.MeshStandardMaterial({ 
      color: 0xAB6B40, roughness: 0.8,
      polygonOffset: true, polygonOffsetFactor: 1, polygonOffsetUnits: 1 
    });
    const lineMat = new THREE.LineBasicMaterial({ color: 0x4A2B18, linewidth: 1 });

    const createBlock = (w, h, d, material, posX, posY, posZ) => {
      const geo = new THREE.BoxGeometry(w, h, d);
      const mesh = new THREE.Mesh(geo, material);
      mesh.position.set(posX, posY, posZ);
      mesh.castShadow = true;
      mesh.receiveShadow = true;
      const edges = new THREE.EdgesGeometry(geo);
      mesh.add(new THREE.LineSegments(edges, lineMat));
      return mesh;
    };

    let groupA = new THREE.Group(); 
    let groupB = new THREE.Group(); 
    let draggableObjects = [];

    if (activeTab === '3d') {
      camera.position.set(12, 12, 16);
      controls.target.set(0, 0, 0);

      const createShapeBlock = (shape, extrudeDepth, material, posX, posY, posZ) => {
        const extrudeSettings = { depth: extrudeDepth, bevelEnabled: false };
        const geo = new THREE.ExtrudeGeometry(shape, extrudeSettings);
        geo.translate(0, 0, -extrudeDepth / 2); 
        const mesh = new THREE.Mesh(geo, material);
        mesh.position.set(posX, posY, posZ);
        mesh.castShadow = true;
        mesh.receiveShadow = true;
        const edges = new THREE.EdgesGeometry(geo, 15);
        mesh.add(new THREE.LineSegments(edges, lineMat));
        return mesh;
      };

      if (activeStructure.id === 'zhisun') {
        groupB.add(createBlock(2, 6, 2, woodMatBottom, 0, -3, 0));
        groupB.add(createBlock(1, 2, 1, woodMatBottom, 0, 1, 0));
        groupA.add(createBlock(3.48, 2, 2, woodMatTop, -2.26, 1, 0));
        groupA.add(createBlock(3.48, 2, 2, woodMatTop, 2.26, 1, 0));
        groupA.add(createBlock(1.04, 2, 0.48, woodMatTop, 0, 1, 0.76));
        groupA.add(createBlock(1.04, 2, 0.48, woodMatTop, 0, 1, -0.76));
        masterGroup.position.y = -1;
      } else if (activeStructure.id === 'yanweisun') {
        const zLength = 6;
        groupB.add(createBlock(5, 2, zLength, woodMatBottom, 0, -1, 0)); 
        const tailShape = new THREE.Shape();
        tailShape.moveTo(-1, 0); tailShape.lineTo(1, 0); tailShape.lineTo(1.5, 2); tailShape.lineTo(-1.5, 2); tailShape.lineTo(-1, 0);
        groupB.add(createShapeBlock(tailShape, zLength, woodMatBottom, 0, 0, 0));

        const tol = 0.02;
        const outerShape = new THREE.Shape();
        outerShape.moveTo(-1 - tol, 0); outerShape.lineTo(-2.5, 0); outerShape.lineTo(-2.5, 3); outerShape.lineTo(2.5, 3); outerShape.lineTo(2.5, 0); outerShape.lineTo(1 + tol, 0); outerShape.lineTo(1.5 + tol, 2 + tol); outerShape.lineTo(-1.5 - tol, 2 + tol); outerShape.lineTo(-1 - tol, 0);
        
        groupA.add(createShapeBlock(outerShape, zLength, woodMatTop, 0, 0, 0));
        masterGroup.position.y = -2;
      }

      masterGroup.add(groupB);
      masterGroup.add(groupA);

    } else if (activeTab === 'sandbox') {
      masterGroup.position.y = 0;
      camera.position.set(-2, 14, 14); 
      controls.target.set(0, 0, 0);
      controls.maxPolarAngle = Math.PI / 2 + 0.1; 
      
      const seatShape = new THREE.Shape();
      const hw = 2.2; 
      seatShape.moveTo(-hw, -hw); seatShape.lineTo(hw, -hw); seatShape.lineTo(hw, hw); seatShape.lineTo(-hw, hw); seatShape.lineTo(-hw, -hw);
      
      const holeSize = 0.3; 
      const createHole = (cx, cz) => {
        const h = new THREE.Path();
        h.moveTo(cx - holeSize, cz - holeSize); 
        h.lineTo(cx - holeSize, cz + holeSize); 
        h.lineTo(cx + holeSize, cz + holeSize); 
        h.lineTo(cx + holeSize, cz - holeSize); 
        h.lineTo(cx - holeSize, cz - holeSize);
        return h;
      };
      
      seatShape.holes.push(createHole(1.4, 1.4));
      seatShape.holes.push(createHole(1.4, -1.4));
      seatShape.holes.push(createHole(-1.4, 1.4));
      seatShape.holes.push(createHole(-1.4, -1.4));

      const extrudeSettings = { depth: 0.5, bevelEnabled: true, bevelThickness: 0.05, bevelSize: 0.05, bevelSegments: 2 };
      const seatGeo = new THREE.ExtrudeGeometry(seatShape, extrudeSettings);
      seatGeo.translate(0, 0, -0.25); 
      
      const seatMesh = new THREE.Mesh(seatGeo, woodMatTop);
      seatMesh.rotation.x = Math.PI / 2;
      seatMesh.position.set(0, 0, 0); 
      const seatEdges = new THREE.EdgesGeometry(seatGeo, 15);
      seatMesh.add(new THREE.LineSegments(seatEdges, lineMat));
      masterGroup.add(seatMesh);

      SANDBOX_PARTS.forEach(part => {
        const legGroup = new THREE.Group();

        const body = createBlock(0.8, 2.5, 0.8, woodMatBottom, 0, -1.55, 0);

        const tenon = createBlock(0.58, 0.6, 0.58, woodMatBottom, 0, 0, 0);
        
        legGroup.add(body);
        legGroup.add(tenon);

        legGroup.position.set(...part.init);
        legGroup.rotation.y = Math.random() * Math.PI;
        legGroup.rotation.x = (Math.random() - 0.5) * 1.5; 
        legGroup.rotation.z = (Math.random() - 0.5) * 1.5;

        legGroup.userData = { 
          id: part.id, 
          isDraggable: true, 
          snapped: false, 
          targetPos: new THREE.Vector3(...part.target) 
        };
        
        draggableObjects.push(legGroup);
        masterGroup.add(legGroup);
      });
    }

    const gridHelper = new THREE.GridHelper(20, 20, 0x000000, 0x000000);
    gridHelper.material.opacity = 0.05;
    gridHelper.material.transparent = true;
    gridHelper.position.y = -4;
    scene.add(gridHelper);

    const initialTargetVal = activeTab === '3d' ? activeStructure.animTarget * (1 - assemblyProgress / 100) : 0;
    threeState.current = { 
      scene, camera, renderer, masterGroup, groupA, groupB, 
      reqId: null, targetVal: initialTargetVal, animAxis: activeStructure.animAxis, 
      draggableObjects, isDraggingSandbox: false, controls 
    };

    let draggedMesh = null;
    
    const raycaster = new THREE.Raycaster();
    const dragPlane = new THREE.Plane();
    const mouseOffset = new THREE.Vector3();
    const intersection = new THREE.Vector3();
    const getMouseNDC = (e) => {
      const rect = renderer.domElement.getBoundingClientRect();
      let clientX = e.clientX;
      let clientY = e.clientY;
      if (e.changedTouches && e.changedTouches.length > 0) {
        clientX = e.changedTouches[0].clientX;
        clientY = e.changedTouches[0].clientY;
      }
      return {
        x: ((clientX - rect.left) / rect.width) * 2 - 1,
        y: -((clientY - rect.top) / rect.height) * 2 + 1
      };
    };

    // 统一改为监听 pointerdown，防止 OrbitControls 吞噬 mousedown
    const handleDown = (e) => { 
      // 忽略右键点击拖拽物体
      if (e.button && e.button !== 0) return;

      if (activeTab === 'sandbox') {
        const ndc = getMouseNDC(e);
        raycaster.setFromCamera(ndc, camera);
        
        const intersects = raycaster.intersectObjects(threeState.current.draggableObjects, true);
        if (intersects.length > 0) {
          let hitObj = intersects[0].object;
          while (hitObj && !hitObj.userData.isDraggable) {
            hitObj = hitObj.parent;
          }
          
          if (hitObj && !hitObj.userData.snapped) {
            draggedMesh = hitObj;
            threeState.current.isDraggingSandbox = true;
            
            // 夺取 OrbitControls 的控制权，防止电脑端出现拖拽和旋转冲突
            if (threeState.current.controls) {
              threeState.current.controls.enabled = false; 
            }
            
            const planeNormal = camera.getWorldDirection(new THREE.Vector3()).negate();
            dragPlane.setFromNormalAndCoplanarPoint(planeNormal, draggedMesh.position);
            
            const hitPoint = raycaster.ray.intersectPlane(dragPlane, intersection);
            if (hitPoint) {
              masterGroup.worldToLocal(intersection);
              mouseOffset.copy(draggedMesh.position).sub(intersection);
            }
            
            draggedMesh.children.forEach(c => {
              if (c.material) c.material.emissive.setHex(0x331111);
            });
          }
        }
      }
    };

    const handleUp = () => { 
      if (draggedMesh) {
        draggedMesh.children.forEach(c => {
          if (c.material) c.material.emissive.setHex(0x000000); 
        });
        draggedMesh = null;
        threeState.current.isDraggingSandbox = false;
        
        // 释放物件后，归还摄像机的控制权
        if (threeState.current.controls) {
          threeState.current.controls.enabled = true;
        }
      }
    };

    const handleMove = (e) => {
      if (draggedMesh) {
        if (draggedMesh.userData.snapped) {
           draggedMesh = null;
           threeState.current.isDraggingSandbox = false;
           if (threeState.current.controls) threeState.current.controls.enabled = true;
           return;
        }

        const ndc = getMouseNDC(e);
        raycaster.setFromCamera(ndc, camera);
        const hitPoint = raycaster.ray.intersectPlane(dragPlane, intersection);
        
        if (hitPoint) {
          masterGroup.worldToLocal(intersection);
          draggedMesh.position.copy(intersection.add(mouseOffset));
          
          if (draggedMesh.position.y < -3) draggedMesh.position.y = -3;

          const target = draggedMesh.userData.targetPos;
          const dist = draggedMesh.position.distanceTo(target);
          if (dist < 2.0) { 
            draggedMesh.userData.snapped = true;
            if (sandboxTriggerRef.current) sandboxTriggerRef.current(draggedMesh.userData.id);
            draggedMesh.children.forEach(c => {
              if (c.material) c.material.emissive.setHex(0x000000);
            });
            draggedMesh = null; 
            threeState.current.isDraggingSandbox = false;
            if (threeState.current.controls) {
              threeState.current.controls.enabled = true;
            }
          }
        }
      } 
    };
    
    const canvas = renderer.domElement;
    // 使用统一的 Pointer Events (完美兼容 Mouse 与 Touch)
    canvas.addEventListener('pointerdown', handleDown, {passive: false});
    window.addEventListener('pointerup', handleUp);
    window.addEventListener('pointermove', handleMove, {passive: false});
    
    // 保留 touch 事件作为针对老旧移动端浏览器的最后兜底
    canvas.addEventListener('touchstart', handleDown, {passive: false});
    window.addEventListener('touchend', handleUp);
    window.addEventListener('touchmove', handleMove, {passive: false});

    const handleResize = () => {
      if (!mountRef.current) return;
      const w = mountRef.current.clientWidth;
      const h = mountRef.current.clientHeight;
      camera.aspect = w / h;
      camera.updateProjectionMatrix();
      renderer.setSize(w, h);
    };
    window.addEventListener('resize', handleResize);

    const animate = () => {
      if (threeState.current.controls) {
        threeState.current.controls.update();
      }

      if (activeTab === '3d') {
        const axis = threeState.current.animAxis;
        const currentVal = groupA.position[axis];
        const targetVal = threeState.current.targetVal;
        if (Math.abs(currentVal - targetVal) > 0.005) {
          groupA.position[axis] += (targetVal - currentVal) * 0.15; 
        }
      }

      if (activeTab === 'sandbox') {
        threeState.current.draggableObjects.forEach(obj => {
          if (obj.userData.snapped) {
            obj.position.lerp(obj.userData.targetPos, 0.15);
            obj.rotation.x += (0 - obj.rotation.x) * 0.15;
            obj.rotation.y += (0 - obj.rotation.y) * 0.15;
            obj.rotation.z += (0 - obj.rotation.z) * 0.15;
          }
        });
      }

      if (window._autoRotateEnabled && !threeState.current.isDraggingSandbox && activeTab === '3d') {
        masterGroup.rotation.y += 0.005;
      }

      renderer.render(scene, camera);
      threeState.current.reqId = requestAnimationFrame(animate);
    };
    
    window._autoRotateEnabled = autoRotate;
    animate();

    return () => {
      canvas.removeEventListener('pointerdown', handleDown);
      window.removeEventListener('pointerup', handleUp);
      window.removeEventListener('pointermove', handleMove);
      canvas.removeEventListener('touchstart', handleDown);
      window.removeEventListener('touchend', handleUp);
      window.removeEventListener('touchmove', handleMove);
      window.removeEventListener('resize', handleResize);
    };
  }, [engineLoaded, activeStructure, activeTab]); 

  useEffect(() => {
    window._autoRotateEnabled = autoRotate;
  }, [autoRotate]);

  // --- AI 问答逻辑 ---
  const [chatHistory, setChatHistory] = useState(INITIAL_CHAT);
  const [chatInput, setChatInput] = useState('');
  const [isTyping, setIsTyping] = useState(false);
  const chatEndRef = useRef(null);

  const handleSendMessage = async (e) => {
    e.preventDefault();
    if (!chatInput.trim() || isTyping) return;

    const userMsg = chatInput.trim();
    setChatHistory(prev => [...prev, { sender: 'user', text: userMsg }]);
    setChatInput('');
    setIsTyping(true);

    let systemContext = `你是一个名为“榫卯视界”的非遗智能伴学助手。`;
    if (activeTab === '3d') {
      systemContext += `当前用户正在 3D 展厅观察【${activeStructure.name}】，特性包含：${activeStructure.features.join(',')}。`;
    } else if (activeTab === 'sandbox') {
      systemContext += `当前用户正在沙盒中拼装一把明式小方凳，已完成 ${sandboxScore}/4 的进度。`;
    }

    const systemPrompt = `${systemContext}\n请根据用户的提问进行解答，用生动、专业但易懂的语言，字数尽量控制在 100-150 字。`;

    const aiResponse = await callLLMAPI(userMsg, systemPrompt);
    
    setChatHistory(prev => [...prev, { sender: 'ai', text: aiResponse }]);
    setIsTyping(false);
  };

  useEffect(() => {
    if (chatEndRef.current) {
      chatEndRef.current.scrollIntoView({ behavior: "smooth" });
    }
  }, [chatHistory, activeTab, isTyping]);


  const generateStory = async () => {
    setAiContentType('story');
    setIsGeneratingAiContent(true);
    const prompt = `请为“${activeStructure.name}”写一段简短的科普小故事，可以是古代工匠的传说，也可以是生活中巧妙运用这种结构的趣事。`;
    const systemPrompt = `你是中国传统木作文化科普大师，字数严格控制在 150 字以内，结尾带有一句启发性的总结。`;
    const result = await callLLMAPI(prompt, systemPrompt);
    setAiContent(result);
    setIsGeneratingAiContent(false);
  };

  const generateQuiz = async () => {
    setAiContentType('quiz');
    setIsGeneratingAiContent(true);
    const prompt = `请针对“${activeStructure.name}”的力学特点或历史知识，出一道趣味选择题。`;
    const systemPrompt = `格式必须为：问题：[问题]\nA. [选项A]\nB. [选项B]\nC. [选项C]\n答案与解析：[正确答案及解释]。总字数100字左右。`;
    const result = await callLLMAPI(prompt, systemPrompt);
    setAiContent(result);
    setIsGeneratingAiContent(false);
  };

  const handleResetCamera = () => {
    if (threeState.current.masterGroup && threeState.current.controls) {
      if (activeTab === 'sandbox') {
        threeState.current.camera.position.set(-2, 14, 14);
      } else {
        threeState.current.camera.position.set(12, 12, 16);
        threeState.current.masterGroup.rotation.set(0, 0, 0);
      }
      threeState.current.controls.target.set(0, 0, 0);
      threeState.current.controls.update(); 
    }
  };

  return (
    <div className="flex h-screen w-full bg-[#f4f1ea] text-[#3e3a39] font-sans overflow-hidden">
      
      {/* 侧边导航 */}
      <aside className="w-20 md:w-64 bg-white border-r border-[#e0dcd3] shadow-sm flex flex-col transition-all duration-300 z-30">
        <div className="h-16 flex items-center justify-center md:justify-start md:px-6 border-b border-[#e0dcd3] bg-[#8C4356] text-white">
          <Box className="w-7 h-7 mr-0 md:mr-3" />
          <h1 className="text-xl font-bold tracking-widest hidden md:block">榫卯视界</h1>
        </div>
        
        <nav className="flex-1 py-6">
          <ul className="space-y-2 px-3">
            <li>
              <button 
                onClick={() => setActiveTab('3d')}
                className={`w-full flex items-center justify-center md:justify-start px-3 py-3 rounded-lg transition-colors ${activeTab === '3d' ? 'bg-[#f4f1ea] text-[#8C4356] font-semibold' : 'hover:bg-gray-50'}`}
              >
                <Rotate3D className="w-5 h-5 md:mr-3" />
                <span className="hidden md:block">3D 交互展厅</span>
              </button>
            </li>
            <li>
              <button 
                onClick={() => setActiveTab('sandbox')}
                className={`w-full flex items-center justify-center md:justify-start px-3 py-3 rounded-lg transition-colors ${activeTab === 'sandbox' ? 'bg-[#f4f1ea] text-[#8C4356] font-semibold' : 'hover:bg-gray-50'}`}
              >
                <Wrench className="w-5 h-5 md:mr-3" />
                <span className="hidden md:block">自由拼装沙盒</span>
              </button>
            </li>
            <li>
              <button 
                onClick={() => setActiveTab('ai')}
                className={`w-full flex items-center justify-center md:justify-start px-3 py-3 rounded-lg transition-colors ${activeTab === 'ai' ? 'bg-[#f4f1ea] text-[#8C4356] font-semibold' : 'hover:bg-gray-50'}`}
              >
                <MessageSquareText className="w-5 h-5 md:mr-3" />
                <span className="hidden md:block">AI 智能伴学</span>
              </button>
            </li>
          </ul>

          <div className="mt-10 px-6 hidden md:block">
            <h3 className="text-xs font-bold text-gray-400 uppercase tracking-wider mb-4">结构图谱</h3>
            <ul className="space-y-3">
              {STRUCTURES.map(str => (
                <li key={str.id}>
                  <button 
                    onClick={() => { setActiveStructure(str); setActiveTab('3d'); }}
                    className={`text-sm flex items-center transition-colors text-left ${activeStructure.id === str.id && activeTab === '3d' ? 'text-[#8C4356] font-bold' : 'text-gray-600 hover:text-gray-900'}`}
                  >
                    <div className={`shrink-0 w-2 h-2 rounded-full mr-2 ${activeStructure.id === str.id && activeTab === '3d' ? 'bg-[#8C4356]' : 'bg-gray-300'}`} />
                    {str.name}
                  </button>
                </li>
              ))}
            </ul>
          </div>
        </nav>
      </aside>

      {/* 主工作区 */}
      <main className="flex-1 flex flex-col relative min-w-0">
        
        <header className="h-16 flex items-center justify-between px-4 md:px-6 bg-white/80 backdrop-blur-md border-b border-[#e0dcd3] z-10 absolute top-0 w-full">
          <div className="flex items-center">
            <h2 className="text-lg md:text-xl font-semibold text-[#3e3a39]">
              {activeTab === 'sandbox' ? '鲁班工坊：明式小方凳' : activeStructure.name}
            </h2>
            <span className="ml-3 md:ml-4 px-2 py-1 bg-green-100 text-green-700 text-xs rounded-full border border-green-200 flex items-center">
              {activeTab === 'sandbox' ? '拖拽与点选双模式' : '精准力学模型'}
            </span>
          </div>
          <div className="flex space-x-3 text-xs text-gray-500 font-medium">
             <span className="flex items-center"><Sparkles className="w-4 h-4 mr-1 text-[#8C4356]"/> 通义千问 赋能</span>
          </div>
        </header>

        <div className="flex-1 flex flex-col md:flex-row pt-16 h-full relative">
          
          {/* 左侧 3D 画布 */}
          <div className="flex-1 relative bg-gradient-to-b from-[#F9F6F0] to-[#e8e4db] shadow-inner min-h-[50vh]">
            {!engineLoaded && (
              <div className="absolute inset-0 flex flex-col items-center justify-center text-[#8C4356]">
                <RefreshCcw className="w-8 h-8 animate-spin mb-4" />
                <p className="font-semibold tracking-widest">加载全景 3D 引擎中...</p>
              </div>
            )}
            
            <div ref={mountRef} className="w-full h-full cursor-crosshair touch-none" />

            <div className="absolute bottom-6 md:bottom-8 left-1/2 -translate-x-1/2 bg-white/95 backdrop-blur shadow-lg rounded-full px-4 py-2 md:px-6 md:py-3 flex items-center space-x-4 md:space-x-6 border border-[#e0dcd3] z-20">
              
              {activeTab === '3d' && (
                <>
                  <div className="flex items-center space-x-2 md:space-x-4">
                    <div className="p-2 rounded-full bg-[#8C4356] text-white shadow-inner hidden md:block">
                      <Box className="w-4 h-4 md:w-5 md:h-5" />
                    </div>
                    <div className="flex flex-col items-center justify-center w-28 md:w-40">
                      <input 
                        type="range" min="0" max="100" value={assemblyProgress} 
                        onChange={(e) => setAssemblyProgress(Number(e.target.value))}
                        className="w-full h-1.5 bg-gray-200 rounded-lg appearance-none cursor-pointer accent-[#8C4356]"
                      />
                      <div className="flex justify-between w-full mt-1.5">
                        <span className="text-[10px] text-gray-500 font-bold">完全拆解</span>
                        <span className="text-[10px] text-gray-500 font-bold">无缝组装</span>
                      </div>
                    </div>
                  </div>
                  <div className="w-px h-8 md:h-10 bg-gray-300" />
                  
                  <button 
                    onClick={() => setAutoRotate(!autoRotate)}
                    className="flex items-center flex-col text-gray-700 hover:text-[#8C4356] transition group w-12 md:w-16"
                  >
                    <div className={`p-2 md:p-3 rounded-full mb-1 transition-all ${autoRotate ? 'bg-[#8C4356] text-white shadow-inner' : 'bg-gray-100 group-hover:bg-red-50'}`}>
                      {autoRotate ? <Pause className="w-4 h-4 md:w-5 md:h-5" /> : <Play className="w-4 h-4 md:w-5 md:h-5" />}
                    </div>
                    <span className="text-[10px] md:text-xs font-bold">{autoRotate ? '暂停旋转' : '自动旋转'}</span>
                  </button>
                  <div className="w-px h-8 md:h-10 bg-gray-300" />
                </>
              )}

              <button 
                onClick={handleResetCamera}
                className="flex items-center flex-col text-gray-700 hover:text-[#8C4356] transition group w-12 md:w-16"
              >
                <div className="p-2 md:p-3 rounded-full mb-1 bg-gray-100 group-hover:bg-red-50">
                  <RefreshCcw className="w-4 h-4 md:w-5 md:h-5" />
                </div>
                <span className="text-[10px] md:text-xs font-bold">视角复位</span>
              </button>
            </div>
            
            <div className="absolute top-4 left-4 bg-white/70 px-3 py-1.5 rounded-md text-xs text-gray-700 pointer-events-none border border-white/50 backdrop-blur-sm font-medium hidden md:block shadow-sm">
              <span className="font-bold text-[#8C4356]">💡 操作提示：</span>
              <br/>
              {activeTab === 'sandbox' ? '拖拽椅腿，或直接点击右侧列表快速拼接；空白处可旋转视角' : '在空白处左键旋转、右键平移、滚轮缩放全景视角'}
            </div>
          </div>

          {/* 右侧面板 */}
          <div className="w-full md:w-96 bg-white border-t md:border-t-0 md:border-l border-[#e0dcd3] shadow-xl z-20 flex flex-col h-[50vh] md:h-full">
            
            {/* 3D 展厅面板 */}
            {activeTab === '3d' && (
              <div className="flex-1 overflow-y-auto p-6 animate-in fade-in slide-in-from-right-4 duration-300">
                <div className="flex items-center mb-6 text-[#8C4356]">
                  <BookOpen className="w-6 h-6 mr-2" />
                  <h3 className="text-lg font-bold">结构解析</h3>
                </div>
                
                <h4 className="text-2xl font-black text-gray-900 mb-2">{activeStructure.name}</h4>
                <div className="flex flex-wrap gap-2 mb-6">
                  {activeStructure.features.map(f => (
                    <span key={f} className="px-2 py-1 bg-orange-50 text-orange-800 text-xs rounded border border-orange-100 font-medium">
                      {f}
                    </span>
                  ))}
                </div>

                <div className="space-y-4 text-sm text-gray-600 leading-relaxed mb-6 border-b border-gray-100 pb-6">
                  <div>
                    <h5 className="font-bold text-gray-900 mb-2 flex items-center">
                      <span className="w-1.5 h-1.5 bg-[#8C4356] rounded-full mr-2"></span>力学原理解析
                    </h5>
                    <p>{activeStructure.desc}</p>
                  </div>
                  <div>
                    <h5 className="font-bold text-gray-900 mb-2 flex items-center">
                      <span className="w-1.5 h-1.5 bg-[#8C4356] rounded-full mr-2"></span>历史脉络
                    </h5>
                    <p>{activeStructure.history}</p>
                  </div>
                </div>

                <div className="bg-gradient-to-br from-indigo-50 to-purple-50 rounded-xl p-4 border border-indigo-100">
                  <h5 className="font-bold text-indigo-900 mb-3 flex items-center">
                    <Sparkles className="w-4 h-4 mr-1 text-indigo-500" /> AI 延伸探索
                  </h5>
                  <div className="flex space-x-2 mb-4">
                    <button onClick={generateStory} disabled={isGeneratingAiContent} className="flex-1 bg-white hover:bg-indigo-50 text-indigo-700 text-xs py-2 px-3 rounded-lg border border-indigo-200 transition font-medium flex items-center justify-center disabled:opacity-50">
                      <Lightbulb className="w-3.5 h-3.5 mr-1"/> ✨ 结构趣闻
                    </button>
                    <button onClick={generateQuiz} disabled={isGeneratingAiContent} className="flex-1 bg-white hover:bg-purple-50 text-purple-700 text-xs py-2 px-3 rounded-lg border border-purple-200 transition font-medium flex items-center justify-center disabled:opacity-50">
                      <BrainCircuit className="w-3.5 h-3.5 mr-1"/> ✨ 考考我
                    </button>
                  </div>
                  {isGeneratingAiContent && <div className="text-center py-4 text-xs text-indigo-500 animate-pulse flex items-center justify-center"><RefreshCcw className="w-3.5 h-3.5 mr-2 animate-spin" /> 通义千问正在思考...</div>}
                  {!isGeneratingAiContent && aiContent && <div className="bg-white p-4 rounded-lg text-xs leading-relaxed text-gray-700 shadow-inner whitespace-pre-wrap">{aiContent}</div>}
                </div>
              </div>
            )}

            {/* 沙盒面板 */}
            {activeTab === 'sandbox' && (
              <div className="flex-1 flex flex-col p-6 animate-in fade-in slide-in-from-right-4 duration-300 bg-white">
                <div className="flex items-center mb-6 text-[#8C4356]">
                  <Wrench className="w-6 h-6 mr-2" />
                  <h3 className="text-lg font-bold">构建任务</h3>
                </div>
                
                <div className="bg-[#f9f9f9] border border-gray-200 rounded-xl p-5 mb-6 shadow-sm">
                  <h4 className="text-sm font-bold text-gray-800 flex justify-between items-center mb-4">
                    组装进度
                    <span className="bg-[#8C4356] text-white px-3 py-1 rounded-full text-xs">{sandboxScore} / 4</span>
                  </h4>
                  
                  <div className="w-full bg-gray-200 rounded-full h-2 mb-4">
                    <div className="bg-[#8C4356] h-2 rounded-full transition-all duration-500" style={{ width: `${(sandboxScore / 4) * 100}%` }}></div>
                  </div>

                  <ul className="space-y-2">
                    {SANDBOX_PARTS.map(part => {
                      const isSnapped = snappedParts[part.id];
                      return (
                        <li 
                          key={part.id} 
                          onClick={() => handleListClick(part.id)}
                          className={`flex items-center justify-between text-sm p-3 rounded-lg transition-all ${isSnapped ? 'bg-gray-50 border border-transparent' : 'bg-white hover:bg-[#fcfaf7] border border-gray-200 cursor-pointer shadow-sm hover:shadow hover:border-[#8C4356]/30'}`}
                        >
                          <span className={`font-medium transition-colors ${isSnapped ? 'text-gray-400 line-through' : 'text-gray-800'}`}>
                            {part.name}
                          </span>
                          {isSnapped ? 
                            <CheckCircle2 className="w-5 h-5 text-green-500" /> : 
                            <div className="flex items-center text-xs text-[#8C4356] font-medium bg-[#8C4356]/10 px-2 py-1 rounded">
                              <MousePointerClick className="w-3.5 h-3.5 mr-1"/> 点击拼接
                            </div>
                          }
                        </li>
                      );
                    })}
                  </ul>
                </div>

                {sandboxScore === 4 ? (
                  <div className="bg-green-50 border border-green-200 rounded-xl p-6 text-center animate-in zoom-in duration-500">
                    <div className="w-16 h-16 bg-green-100 text-green-600 rounded-full flex items-center justify-center mx-auto mb-3">
                      <Sparkles className="w-8 h-8" />
                    </div>
                    <h4 className="text-lg font-bold text-green-800 mb-2">平齐无缝！</h4>
                    <p className="text-xs text-green-700 leading-relaxed">
                      恭喜您！榫头与凳面严丝合缝、完全平齐，这就是古代工匠追求的“明榫齐平”工艺。
                    </p>
                  </div>
                ) : (
                  <div className="text-center text-gray-400 text-xs mt-2 bg-gray-50 p-3 rounded-lg border border-gray-100">
                    <p>💡 您可以<strong className="text-gray-600">直接点击上方列表</strong>快速拼接，</p>
                    <p className="mt-1">或者在左侧 3D 空间中<strong className="text-gray-600">拖拽椅腿</strong>享受沉浸组装。</p>
                  </div>
                )}
              </div>
            )}

            {/* AI 伴学界面 */}
            {activeTab === 'ai' && (
              <div className="flex-1 flex flex-col animate-in fade-in slide-in-from-right-4 duration-300 h-full bg-[#f9f9f9]">
                <div className="p-4 border-b border-gray-200 bg-white flex items-center shadow-sm">
                  <div className="w-10 h-10 bg-gradient-to-br from-[#8C4356] to-purple-700 rounded-full flex items-center justify-center text-white mr-3 shadow-md relative overflow-hidden">
                    <Sparkles className="w-5 h-5 absolute opacity-50 top-1 right-1" />
                    <MessageSquareText className="w-5 h-5 relative z-10" />
                  </div>
                  <div>
                    <h3 className="font-bold text-gray-900 text-sm flex items-center">
                      非遗智能伴学 <Sparkles className="w-3 h-3 ml-1 text-purple-500"/>
                    </h3>
                    <p className="text-[10px] text-green-600 flex items-center mt-0.5">
                      <span className="w-2 h-2 rounded-full bg-green-500 mr-1 animate-pulse"></span> Powered by 通义千问
                    </p>
                  </div>
                </div>

                <div className="flex-1 overflow-y-auto p-4 space-y-4">
                  {chatHistory.map((msg, i) => (
                    <div key={i} className={`flex ${msg.sender === 'user' ? 'justify-end' : 'justify-start'}`}>
                      {msg.sender === 'ai' && (
                        <div className="w-6 h-6 rounded-full bg-purple-100 flex items-center justify-center mr-2 shrink-0 mt-1">
                          <Sparkles className="w-3 h-3 text-purple-600" />
                        </div>
                      )}
                      <div className={`max-w-[80%] p-3 rounded-2xl text-sm leading-relaxed shadow-sm ${msg.sender === 'user' ? 'bg-[#8C4356] text-white rounded-tr-none' : 'bg-white text-gray-800 border border-gray-100 rounded-tl-none'}`}>
                        {msg.text}
                      </div>
                    </div>
                  ))}
                  {isTyping && (
                    <div className="flex justify-start">
                      <div className="w-6 h-6 rounded-full bg-purple-100 flex items-center justify-center mr-2 shrink-0 mt-1">
                        <Sparkles className="w-3 h-3 text-purple-600 animate-pulse" />
                      </div>
                      <div className="bg-white p-3 rounded-2xl rounded-tl-none border border-gray-100 text-gray-400 text-sm flex space-x-1 items-center">
                        <div className="w-1.5 h-1.5 bg-gray-400 rounded-full animate-bounce"></div>
                        <div className="w-1.5 h-1.5 bg-gray-400 rounded-full animate-bounce" style={{animationDelay: '0.1s'}}></div>
                        <div className="w-1.5 h-1.5 bg-gray-400 rounded-full animate-bounce" style={{animationDelay: '0.2s'}}></div>
                      </div>
                    </div>
                  )}
                  <div ref={chatEndRef} />
                </div>

                <div className="p-4 bg-white border-t border-gray-200">
                  <div className="text-[10px] text-gray-400 mb-2 text-center">AI 已感知当前状态，快向它提问吧！</div>
                  <form onSubmit={handleSendMessage} className="flex items-center space-x-2">
                    <input 
                      type="text" value={chatInput} onChange={e => setChatInput(e.target.value)}
                      placeholder="提问，例如：在现代建筑中还有用到它吗？" 
                      disabled={isTyping}
                      className="flex-1 px-4 py-2 bg-gray-100 border-transparent rounded-full text-sm focus:bg-white focus:border-purple-300 focus:ring-2 focus:ring-purple-200 transition outline-none disabled:bg-gray-50"
                    />
                    <button type="submit" disabled={!chatInput.trim() || isTyping} className="p-2 bg-gradient-to-r from-[#8C4356] to-purple-700 text-white rounded-full hover:shadow-lg transition disabled:opacity-50 disabled:cursor-not-allowed shadow-md">
                      <Send className="w-4 h-4 ml-0.5" />
                    </button>
                  </form>
                </div>
              </div>
            )}
          </div>
        </div>
      </main>
    </div>
  );
}