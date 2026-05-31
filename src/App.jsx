import React, { useState, useRef, useEffect } from 'react';
import { jsPDF } from 'jspdf';

export default function App() {
  const [images, setImages] = useState([]);
  const [isDragging, setIsDragging] = useState(false);
  const [isProcessing, setIsProcessing] = useState(false);
  
  const [quality, setQuality] = useState(0.7); 
  const [pageSize, setPageSize] = useState('fit');
  const [imageFit, setImageFit] = useState('contain'); 
  const [margin, setMargin] = useState(0); 
  const [addPageNumbers, setAddPageNumbers] = useState(false);
  const [orientation, setOrientation] = useState('p');

  const [sliderPosition, setSliderPosition] = useState(50);
  const containerRef = useRef(null);
  const isSliding = useRef(false);

  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [previewMetrics, setPreviewMetrics] = useState({
    originalSize: '0 KB',
    compressedSize: '0 KB',
    savings: 0,
    previewUrl: '',
    originalUrl: '' 
  });

  const dragCounter = useRef(0);
  // THE FIX: We add a ref to track if the user is dragging an internal grid item
  const isInternalDragging = useRef(false);

  useEffect(() => {
    const handleDragEnter = (e) => { 
      e.preventDefault(); 
      // THE FIX: Ignore the drag if it's an internal grid item
      if (isInternalDragging.current) return; 
      
      dragCounter.current++; 
      if (e.dataTransfer.items && e.dataTransfer.items.length > 0) setIsDragging(true); 
    };
    
    const handleDragLeave = (e) => { 
      e.preventDefault(); 
      if (isInternalDragging.current) return; 
      
      dragCounter.current--; 
      if (dragCounter.current === 0) setIsDragging(false); 
    };
    
    const handleDragOver = (e) => {
      e.preventDefault();
    };
    
    const handleDrop = (e) => {
      e.preventDefault(); 
      if (isInternalDragging.current) return; 
      
      setIsDragging(false); 
      dragCounter.current = 0;
      if (e.dataTransfer && e.dataTransfer.files.length > 0) { 
        addFiles(Array.from(e.dataTransfer.files)); 
        e.dataTransfer.clearData(); 
      }
    };

    window.addEventListener('dragenter', handleDragEnter);
    window.addEventListener('dragleave', handleDragLeave);
    window.addEventListener('dragover', handleDragOver);
    window.addEventListener('drop', handleDrop);

    return () => {
      window.removeEventListener('dragenter', handleDragEnter);
      window.removeEventListener('dragleave', handleDragLeave);
      window.removeEventListener('dragover', handleDragOver);
      window.removeEventListener('drop', handleDrop);
    };
  }, [images]);

  useEffect(() => {
    if (images.length === 0) {
      setPreviewMetrics({ originalSize: '0 KB', compressedSize: '0 KB', savings: 0, previewUrl: '', originalUrl: '' });
      return;
    }

    setIsAnalyzing(true);
    const targetFile = images[0].file;
    const originalSizeKb = (targetFile.size / 1024).toFixed(1);
    const maxResolutionLimit = quality <= 0.3 ? 1000 : quality <= 0.6 ? 1600 : 2400;
    const rawOrigUrl = URL.createObjectURL(targetFile);

    processImageFile(targetFile, parseFloat(quality), maxResolutionLimit).then(({ compressedUrl }) => {
      const stringLength = compressedUrl.length - 'data:image/jpeg;base64,'.length;
      const actualByteWeight = (stringLength * 3) / 4;
      const compressedSizeKb = (actualByteWeight / 1024).toFixed(1);
      const spaceSavedPercentage = Math.max(0, Math.round(((targetFile.size - actualByteWeight) / targetFile.size) * 100));

      setPreviewMetrics({
        originalSize: `${originalSizeKb} KB`,
        compressedSize: `${compressedSizeKb} KB`,
        savings: spaceSavedPercentage,
        previewUrl: compressedUrl,
        originalUrl: rawOrigUrl
      });
      setIsAnalyzing(false);
    });

    return () => URL.revokeObjectURL(rawOrigUrl);
  }, [quality, images]);

  const handleSliderMove = (clientX) => {
    if (!containerRef.current) return;
    const rect = containerRef.current.getBoundingClientRect();
    const x = clientX - rect.left;
    const percentage = Math.max(0, Math.min(100, (x / rect.width) * 100));
    setSliderPosition(percentage);
  };

  const handleTouchMove = (e) => {
    if (!isSliding.current) return;
    handleSliderMove(e.touches[0].clientX);
  };

  const handleMouseMove = (e) => {
    if (!isSliding.current) return;
    handleSliderMove(e.clientX);
  };

  useEffect(() => {
    const handleMouseUp = () => { isSliding.current = false; };
    window.addEventListener('mouseup', handleMouseUp);
    window.addEventListener('touchend', handleMouseUp);
    return () => {
      window.removeEventListener('mouseup', handleMouseUp);
      window.removeEventListener('touchend', handleMouseUp);
    };
  }, []);

  const handleFileUpload = (e) => {
    if (!e.target.files) return;
    addFiles(Array.from(e.target.files));
    e.target.value = ''; 
  };

  const addFiles = async (files) => {
    let validFiles = files.filter(file => 
      (file.type && file.type.startsWith('image/')) || /\.(jpg|jpeg|png|webp)$/i.test(file.name)
    );

    if (validFiles.length === 0) return;
    if (validFiles.length > 1) {
      validFiles = validFiles.sort((a, b) => a.name.localeCompare(b.name, undefined, { numeric: true, sensitivity: 'base' }));
    }

    const processedBatch = [];
    for (const file of validFiles) {
      const thumbUrl = await generateThumbnail(file);
      processedBatch.push({ id: Math.random().toString(36).substring(7), file, previewUrl: thumbUrl });
    }
    setImages(prev => [...prev, ...processedBatch]);
  };

  const generateThumbnail = (file) => {
    return new Promise((resolve) => {
      const img = new Image();
      const objectUrl = URL.createObjectURL(file);
      img.onload = () => {
        URL.revokeObjectURL(objectUrl);
        const MAX_SIZE = 240;
        let { width, height } = img;
        if (width > height && width > MAX_SIZE) { height *= MAX_SIZE / width; width = MAX_SIZE; } 
        else if (height > MAX_SIZE) { width *= MAX_SIZE / height; height = MAX_SIZE; }
        const canvas = document.createElement('canvas');
        canvas.width = width; canvas.height = height;
        const ctx = canvas.getContext('2d');
        ctx.drawImage(img, 0, 0, width, height);
        resolve(canvas.toDataURL('image/jpeg', 0.5));
      };
      img.src = objectUrl;
    });
  };

  const processImageFile = (file, targetQuality, maxDimension = 1600) => {
    return new Promise((resolve) => {
      const img = new Image();
      const objectUrl = URL.createObjectURL(file);
      img.onload = () => {
        URL.revokeObjectURL(objectUrl);
        let width = img.width; let height = img.height;
        if (width > maxDimension || height > maxDimension) {
          if (width > height) { height = Math.round((height * maxDimension) / width); width = maxDimension; } 
          else { width = Math.round((width * maxDimension) / height); height = maxDimension; }
        }
        const canvas = document.createElement('canvas');
        canvas.width = width; canvas.height = height;
        const ctx = canvas.getContext('2d');
        ctx.imageSmoothingEnabled = true;
        ctx.imageSmoothingQuality = 'high';
        ctx.drawImage(img, 0, 0, width, height);
        resolve({ compressedUrl: canvas.toDataURL('image/jpeg', targetQuality), width, height });
      };
      img.src = objectUrl;
    });
  };

  const sortAlphabeticalAZ = () => setImages([...images].sort((a, b) => a.file.name.localeCompare(b.file.name, undefined, { numeric: true, sensitivity: 'base' })));
  const sortAlphabeticalZA = () => setImages([...images].sort((a, b) => b.file.name.localeCompare(a.file.name, undefined, { numeric: true, sensitivity: 'base' })));
  const clearAllQueue = () => setImages([]);
  const handleRemoveImage = (idToRemove) => setImages(images.filter(i => i.id !== idToRemove));

  const handleDropSort = (draggedIndex, targetIndex) => {
    if (draggedIndex === targetIndex) return;
    const copyList = [...images];
    const item = copyList[draggedIndex];
    copyList.splice(draggedIndex, 1);
    copyList.splice(targetIndex, 0, item);
    setImages(copyList);
  };

  const generatePDF = async () => {
    if (images.length === 0) return;
    setIsProcessing(true);
    try {
      const doc = new jsPDF({ orientation, unit: 'mm', format: pageSize === 'fit' ? 'a4' : pageSize });
      const maxPdfDimensionMm = 297;
      const computedMargin = parseFloat(margin);

      for (let i = 0; i < images.length; i++) {
        await new Promise(r => setTimeout(r, 12));
        const maxResolutionLimit = quality <= 0.3 ? 1000 : quality <= 0.6 ? 1600 : 2400;
        const { compressedUrl, width, height } = await processImageFile(images[i].file, parseFloat(quality), maxResolutionLimit);
        
        let imgWidthMm = (width * 25.4) / 96; let imgHeightMm = (height * 25.4) / 96;

        if (pageSize === 'fit') {
          if (imgWidthMm > maxPdfDimensionMm || imgHeightMm > maxPdfDimensionMm) {
            const scaleFactor = Math.min(maxPdfDimensionMm / imgWidthMm, maxPdfDimensionMm / imgHeightMm);
            imgWidthMm *= scaleFactor; imgHeightMm *= scaleFactor;
          }
          const finalPageWidth = imgWidthMm + (computedMargin * 2);
          const finalPageHeight = imgHeightMm + (computedMargin * 2);

          if (i > 0) doc.addPage([finalPageWidth, finalPageHeight], finalPageWidth > finalPageHeight ? 'l' : 'p');
          else { doc.deletePage(1); doc.addPage([finalPageWidth, finalPageHeight], finalPageWidth > finalPageHeight ? 'l' : 'p'); }
          doc.addImage(compressedUrl, 'JPEG', computedMargin, computedMargin, imgWidthMm, imgHeightMm, undefined, 'FAST');
        } else {
          if (i > 0) doc.addPage(pageSize, orientation);
          const pW = doc.internal.pageSize.getWidth(); const pH = doc.internal.pageSize.getHeight();
          const printableWidth = pW - (computedMargin * 2); const printableHeight = pH - (computedMargin * 2);
          
          let dW, dH;
          if (imageFit === 'contain') {
            const ratio = Math.min(printableWidth / imgWidthMm, printableHeight / imgHeightMm);
            dW = imgWidthMm * ratio; dH = imgHeightMm * ratio;
          } else {
            const ratio = Math.max(printableWidth / imgWidthMm, printableHeight / imgHeightMm);
            dW = imgWidthMm * ratio; dH = imgHeightMm * ratio;
          }
          doc.addImage(compressedUrl, 'JPEG', (pW - dW) / 2, (pH - dH) / 2, dW, dH, undefined, 'FAST');
        }

        if (addPageNumbers) {
          doc.setFont('helvetica', 'normal'); doc.setFontSize(9); doc.setTextColor(110, 120, 135);
          doc.text(`${i + 1} / ${images.length}`, doc.internal.pageSize.getWidth() / 2, doc.internal.pageSize.getHeight() - 8, { align: 'center' });
        }
      }

      const firstImgName = images[0]?.file.name || 'document';
      const baseDocumentName = firstImgName.split('.').slice(0, -1).join('.') || firstImgName;
      doc.save(`${baseDocumentName}-ImageToPDFNow.pdf`);
    } catch (e) { console.error(e); } finally { setIsProcessing(false); }
  };

  return (
    <div className="min-h-screen bg-slate-50 text-slate-800 font-sans antialiased relative overflow-x-hidden flex flex-col">
      
      {/* BRANDED DRAG-OVER RECEPTACLE OVERLAY */}
      {isDragging && (
        <div className="fixed inset-0 bg-gradient-to-br from-teal-700/95 to-emerald-800/95 z-[999] backdrop-blur-md flex flex-col items-center justify-center text-white pointer-events-none transition-all duration-200">
          <div className="animate-bounce mb-6 bg-white/20 p-6 rounded-full shadow-2xl">
            <svg xmlns="http://www.w3.org/2000/svg" width="72" height="72" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M4 14.899A7 7 0 1 1 15.71 8h1.79a4.5 4.5 0 0 1 2.5 8.242"/><path d="M12 12v9"/><path d="m16 16-4-4-4 4"/></svg>
          </div>
          <h2 className="text-4xl font-black tracking-tight drop-shadow-md">Drop files anywhere!</h2>
        </div>
      )}

      {/* CUSTOM LOGO HEADER */}
      <header className="bg-white border-b border-slate-100 py-4 px-8 flex justify-between items-center sticky top-0 z-50 shadow-xs">
        <div className="flex items-center gap-3">
          <img src="/logo.png" alt="ImageToPDFNow Brand Logo" className="w-10 h-10 object-contain drop-shadow-sm" />
          <span className="text-xl font-black text-slate-900 tracking-tight">ImageToPDFNow</span>
        </div>
        <h1 className="hidden lg:block text-xs text-slate-400 font-medium">Professional Client-Side Layout Desk</h1>
      </header>

      <main className="max-w-7xl mx-auto p-6 grid grid-cols-1 lg:grid-cols-12 gap-6 items-start flex-grow w-full">
        
        {/* LEFT WORKSPACE CARD */}
        <div className="lg:col-span-8 space-y-6">
          {images.length === 0 ? (
            <div className="bg-white border border-slate-200 rounded-3xl p-16 text-center shadow-xs flex flex-col items-center justify-center min-h-[440px]">
              <div className="bg-teal-50 text-teal-500 p-6 rounded-full mb-5 border border-teal-100">
                <svg xmlns="http://www.w3.org/2000/svg" width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="17 8 12 3 7 8"/><line x1="12" y1="3" x2="12" y2="15"/></svg>
              </div>
              <h2 className="text-2xl font-black text-slate-800 tracking-tight">Drag & drop photos anywhere onto this window</h2>
              <p className="text-sm text-slate-400 mt-2 max-w-sm mx-auto leading-relaxed">
                Start building your layout matrix. Supports secure, client-side compilation of JPEG, PNG, and WebP assets.
              </p>
              <label className="mt-7 cursor-pointer bg-gradient-to-r from-teal-400 to-emerald-500 hover:from-teal-500 hover:to-emerald-600 text-white px-8 py-3.5 rounded-xl font-black text-sm transition-all shadow-lg shadow-teal-500/20 transform hover:-translate-y-0.5">
                Browse System Files
                <input type="file" multiple accept="image/jpeg, image/png, image/jpg, image/webp" className="hidden" onChange={handleFileUpload} />
              </label>
            </div>
          ) : (
            <div className="bg-white p-6 rounded-3xl border border-slate-100 shadow-xs">
              <div className="flex flex-col md:flex-row justify-between md:items-center gap-4 mb-6 pb-4 border-b border-slate-100">
                <div>
                  <h2 className="font-black text-md text-slate-800">Layout Sequence Desk</h2>
                  <p className="text-xs text-slate-400 mt-0.5">Control layout paths manually or via fast automatic arrangement links.</p>
                </div>
                <div className="flex flex-wrap items-center gap-2">
                  <button onClick={sortAlphabeticalAZ} className="bg-slate-50 border border-slate-200 text-slate-600 font-bold text-xs px-3 py-2 rounded-xl hover:bg-teal-50 hover:text-teal-700 hover:border-teal-200 transition-colors flex items-center gap-1">
                    <svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="m3 16 4 4 4-4"/><path d="M7 20V4"/><path d="M11 4h10"/><path d="M11 9h7"/><path d="M11 14h4"/></svg> Sort A-Z
                  </button>
                  <button onClick={sortAlphabeticalZA} className="bg-slate-50 border border-slate-200 text-slate-600 font-bold text-xs px-3 py-2 rounded-xl hover:bg-teal-50 hover:text-teal-700 hover:border-teal-200 transition-colors flex items-center gap-1">
                    <svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="m3 8 4-4 4 4"/><path d="M7 4v16"/><path d="M11 4h10"/><path d="M11 9h7"/><path d="M11 14h4"/></svg> Sort Z-A
                  </button>
                  <button onClick={clearAllQueue} className="bg-slate-50 text-red-600 border border-slate-200 font-bold text-xs px-3 py-2 rounded-xl hover:bg-red-50 hover:border-red-200 transition-colors flex items-center gap-1">
                    Clear All
                  </button>
                </div>
              </div>

              {/* THE FIX IS APPLIED TO THIS GRID LAYER */}
              <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-4">
                {images.map((img, index) => (
                  <div 
                    key={img.id} 
                    draggable 
                    onDragStart={(e) => {
                      isInternalDragging.current = true; // Block global window interceptor
                      e.dataTransfer.setData("text/plain", index);
                    }} 
                    onDragEnd={() => {
                      isInternalDragging.current = false; // Reset interceptor
                    }}
                    onDragOver={(e) => e.preventDefault()} 
                    onDrop={(e) => {
                      e.stopPropagation(); // Stop event from hitting the window object
                      handleDropSort(parseInt(e.dataTransfer.getData("text/plain"), 10), index);
                    }} 
                    className="group relative cursor-grab active:cursor-grabbing bg-slate-50 rounded-2xl aspect-square overflow-hidden border-2 border-slate-100 hover:border-teal-400 shadow-sm transition-all duration-150"
                  >
                    <img src={img.previewUrl} loading="lazy" alt={img.file.name} className="w-full h-full object-cover pointer-events-none" />
                    <button onClick={() => handleRemoveImage(img.id)} className="absolute top-2 right-2 opacity-0 group-hover:opacity-100 bg-white/95 text-slate-400 p-2 rounded-xl shadow-xs hover:bg-red-50 hover:text-red-600 transition-all">
                      <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M18 6L6 18M6 6l12 12"/></svg>
                    </button>
                    <div className="absolute bottom-0 left-0 right-0 bg-slate-900/80 backdrop-blur-xs text-white text-[10px] px-2.5 py-2 truncate font-bold">{index + 1}. {img.file.name}</div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* RIGHT CONFIGURATION SIDEBAR */}
        <div className="lg:col-span-4 sticky top-24">
          <div className="bg-white p-6 rounded-3xl border border-slate-100 shadow-xs">
            <h2 className="text-sm font-black text-slate-800 flex items-center gap-2 mb-6 uppercase tracking-wider">
              <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" className="text-teal-500" strokeWidth="2.5"><circle cx="12" cy="12" r="3" /><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z" /></svg>
              PDF Parameters
            </h2>

            <div className="space-y-6">
              <div>
                <div className="flex justify-between items-center mb-2">
                  <label className="text-xs font-bold text-slate-500 tracking-wide uppercase">DPI Optimization</label>
                  <span className="text-xs font-black text-teal-700 bg-teal-50 border border-teal-100 px-2 py-0.5 rounded-md">{quality <= 0.3 ? 'Ultra Light Size' : quality <= 0.6 ? 'Balanced Desktop' : 'Lossless Sharpness'}</span>
                </div>
                <input type="range" min="0.1" max="1.0" step="0.1" value={quality} onChange={(e) => setQuality(e.target.value)} className="w-full h-2 bg-slate-100 rounded-lg appearance-none cursor-pointer accent-teal-500" />
              </div>

              <div className="border-t border-slate-100" />

              <div>
                <label className="block text-xs font-bold text-slate-500 tracking-wide uppercase mb-2">Sheet Canvas Target</label>
                <select value={pageSize} onChange={(e) => setPageSize(e.target.value)} className="w-full border border-slate-200 rounded-xl p-3 text-sm font-semibold outline-none focus:border-teal-500 focus:ring-1 focus:ring-teal-500 bg-slate-50/50 text-slate-700 transition-all cursor-pointer">
                  <option value="fit">Dynamic Boundary (Matches Image Edge)</option>
                  <option value="a4">Standard A4 Sheet</option>
                  <option value="a5">Compact A5 Notebook Format</option>
                  <option value="letter">US Letter Standard Dimensional</option>
                </select>
              </div>

              {pageSize !== 'fit' && (
                <div>
                  <label className="block text-xs font-bold text-slate-500 tracking-wide uppercase mb-2">Aspect Fitting Style</label>
                  <div className="grid grid-cols-2 gap-2">
                    <button onClick={() => setImageFit('contain')} className={`py-2 px-3 border-2 text-xs font-bold rounded-xl transition-all ${imageFit === 'contain' ? 'bg-teal-50 border-teal-500 text-teal-700' : 'bg-slate-50/50 border-slate-200 text-slate-500 hover:border-slate-300'}`}>Contain Whole</button>
                    <button onClick={() => setImageFit('cover')} className={`py-2 px-3 border-2 text-xs font-bold rounded-xl transition-all ${imageFit === 'cover' ? 'bg-teal-50 border-teal-500 text-teal-700' : 'bg-slate-50/50 border-slate-200 text-slate-500 hover:border-slate-300'}`}>Center Cover Crop</button>
                  </div>
                </div>
              )}

              <div>
                <label className="block text-xs font-bold text-slate-500 tracking-wide uppercase mb-2">Document Margins</label>
                <div className="grid grid-cols-3 gap-2">
                  <button onClick={() => setMargin(0)} className={`py-2 px-1 border-2 text-xs font-bold rounded-xl transition-all ${margin === 0 ? 'bg-teal-50 border-teal-500 text-teal-700' : 'bg-slate-50/50 border-slate-200 text-slate-500 hover:border-slate-300'}`}>0mm</button>
                  <button onClick={() => setMargin(5)} className={`py-2 px-1 border-2 text-xs font-bold rounded-xl transition-all ${margin === 5 ? 'bg-teal-50 border-teal-500 text-teal-700' : 'bg-slate-50/50 border-slate-200 text-slate-500 hover:border-slate-300'}`}>5mm</button>
                  <button onClick={() => setMargin(12)} className={`py-2 px-1 border-2 text-xs font-bold rounded-xl transition-all ${margin === 12 ? 'bg-teal-50 border-teal-500 text-teal-700' : 'bg-slate-50/50 border-slate-200 text-slate-500 hover:border-slate-300'}`}>12mm</button>
                </div>
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-500 tracking-wide uppercase mb-2">Orientation Matrix</label>
                <div className="grid grid-cols-2 gap-2">
                  <button onClick={() => setOrientation('p')} disabled={pageSize === 'fit'} className={`py-2.5 px-4 border-2 text-xs font-black rounded-xl transition-all ${orientation === 'p' && pageSize !== 'fit' ? 'bg-teal-50 border-teal-500 text-teal-700 shadow-sm' : 'bg-slate-50/50 border-slate-200 text-slate-400'} disabled:opacity-30`}>Portrait</button>
                  <button onClick={() => setOrientation('l')} disabled={pageSize === 'fit'} className={`py-2.5 px-4 border-2 text-xs font-black rounded-xl transition-all ${orientation === 'l' && pageSize !== 'fit' ? 'bg-teal-50 border-teal-500 text-teal-700 shadow-sm' : 'bg-slate-50/50 border-slate-200 text-slate-400'} disabled:opacity-30`}>Landscape</button>
                </div>
              </div>

              <div className="border-t border-slate-100 my-2" />

              <label className="flex items-center gap-3 py-1 cursor-pointer group select-none">
                <input type="checkbox" checked={addPageNumbers} onChange={(e) => setAddPageNumbers(e.target.checked)} className="w-4 h-4 text-teal-500 border-slate-300 rounded focus:ring-teal-500 accent-teal-500 cursor-pointer" />
                <span className="text-xs font-semibold text-slate-600 group-hover:text-slate-900 transition-colors">Append Dynamic Page Numbers</span>
              </label>

              <button onClick={generatePDF} disabled={images.length === 0 || isProcessing} className="w-full mt-2 bg-gradient-to-r from-teal-500 to-emerald-500 hover:from-teal-600 hover:to-emerald-600 disabled:from-slate-200 disabled:to-slate-200 disabled:text-slate-400 text-white py-4 rounded-2xl font-black text-sm flex items-center justify-center gap-2 shadow-lg shadow-teal-500/20 active:scale-[0.98] transition-all">
                {isProcessing ? <span className="animate-pulse">Compiling Engine...</span> : (
                  <>
                    Compile & Download PDF 
                    <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M5 12h14"/><path d="m12 5 7 7-7 7"/></svg>
                  </>
                )}
              </button>
            </div>
          </div>
        </div>
      </main>

      {/* --- TWIN LINKED SPLIT-SCREEN COMPARISON SLIDER DECK --- */}
      {images.length > 0 && (
        <div className="max-w-7xl mx-auto px-6 mt-4 mb-8 w-full">
          <section className="bg-white p-6 rounded-3xl border border-slate-100 shadow-xs grid grid-cols-1 md:grid-cols-12 gap-6 items-center">
            
            <div className="md:col-span-4 space-y-4">
              <div>
                <h3 className="text-md font-black text-slate-800">Advanced Size Analysis</h3>
                <p className="text-xs text-slate-400 mt-0.5">Slide the handle inside the panel to run structural comparison layers on your first image slot.</p>
              </div>
              
              <div className="bg-teal-50/40 p-4 rounded-2xl border border-teal-100/50 space-y-3">
                <div className="flex justify-between text-xs font-bold text-slate-600">
                  <span>Target Compression Ratio</span>
                  <span className="text-teal-600 font-black">{Math.round(quality * 100)}%</span>
                </div>
                <input type="range" min="0.1" max="1.0" step="0.1" value={quality} onChange={(e) => setQuality(e.target.value)} className="w-full h-2 bg-slate-200 rounded-lg appearance-none cursor-pointer accent-teal-500" />
              </div>

              <div className="grid grid-cols-3 gap-2 text-center">
                <div className="bg-slate-50 p-3 rounded-xl border border-slate-100">
                  <div className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Before</div>
                  <div className="text-xs font-black text-slate-700 mt-0.5 truncate">{previewMetrics.originalSize}</div>
                </div>
                <div className="bg-slate-50 p-3 rounded-xl border border-slate-100">
                  <div className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">After</div>
                  <div className="text-xs font-black text-teal-600 mt-0.5 truncate">{previewMetrics.compressedSize}</div>
                </div>
                <div className="bg-emerald-50 p-3 rounded-xl border border-emerald-100/50">
                  <div className="text-[10px] font-bold text-emerald-600 uppercase tracking-wider">Saved</div>
                  <div className="text-xs font-black text-emerald-700 mt-0.5">{previewMetrics.savings}%</div>
                </div>
              </div>
            </div>

            {/* --- INTERACTIVE BEFORE/AFTER SPLIT DRAG SLIDER FRAME --- */}
            <div className="md:col-span-8 flex flex-col h-full min-h-[340px]">
              <div ref={containerRef} onMouseMove={handleMouseMove} onTouchMove={handleTouchMove} className="relative w-full h-72 bg-slate-100 border border-slate-200 rounded-2xl overflow-hidden select-none group cursor-ew-resize">
                
                {/* 1. Underlying Compressed Matrix */}
                {previewMetrics.previewUrl ? (
                  <div className="absolute inset-0 w-full h-full flex items-center justify-center p-2 bg-white">
                    <img src={previewMetrics.previewUrl} alt="Compressed View" className={`w-full h-full object-contain pointer-events-none transform group-hover:scale-[2.5] transition-transform duration-300 origin-center ${isAnalyzing ? 'opacity-40 blur-xs' : 'opacity-100'}`} />
                    <div className="absolute bottom-3 right-3 bg-teal-600 text-white font-bold text-[9px] px-2.5 py-1 rounded-md uppercase tracking-wider z-20 shadow-sm">Compressed Asset</div>
                  </div>
                ) : (
                  <div className="absolute inset-0 flex items-center justify-center text-xs text-slate-400 font-bold animate-pulse">Initializing Layout Data...</div>
                )}

                {/* 2. Clipping Original Layer */}
                <div className="absolute inset-0 h-full overflow-hidden flex items-center p-2 bg-slate-50 border-r border-teal-500/30" style={{ width: `${sliderPosition}%` }}>
                  <div className="absolute inset-0 h-full flex items-center justify-center p-2" style={{ width: containerRef.current ? containerRef.current.getBoundingClientRect().width : '100%' }}>
                    <img src={previewMetrics.originalUrl || images[0].previewUrl} alt="Original View" className="w-full h-full object-contain pointer-events-none transform group-hover:scale-[2.5] transition-transform duration-300 origin-center" />
                    <div className="absolute bottom-3 left-3 bg-slate-800 text-white font-bold text-[9px] px-2.5 py-1 rounded-md uppercase tracking-wider z-20 shadow-sm">Original Baseline</div>
                  </div>
                </div>

                {/* 3. Branded Slider Handle */}
                <div className="absolute top-0 bottom-0 w-0.5 bg-teal-500 z-30 group-hover:bg-teal-400 shadow-[0_0_10px_rgba(20,184,166,0.5)]" style={{ left: `${sliderPosition}%` }}>
                  <div onMouseDown={() => { isSliding.current = true; }} onTouchStart={() => { isSliding.current = true; }} className="absolute top-1/2 -translate-y-1/2 -translate-x-1/2 w-8 h-8 rounded-full bg-white border-2 border-teal-500 shadow-lg flex items-center justify-center cursor-grab active:cursor-grabbing hover:scale-110 transition-transform z-40">
                    <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#0d9488" strokeWidth="3.5" strokeLinecap="round" strokeLinejoin="round"><polyline points="8 17 3 12 8 7" /><polyline points="16 7 21 12 16 17" /></svg>
                  </div>
                </div>

                {isAnalyzing && (
                  <div className="absolute inset-0 bg-white/40 backdrop-blur-xs flex items-center justify-center z-50">
                    <span className="text-xs font-bold text-teal-700 bg-white border border-teal-100 px-5 py-2 rounded-full shadow-lg animate-pulse">Rendering Pixel Matrix...</span>
                  </div>
                )}
              </div>
              <div className="text-center text-[11px] font-semibold text-slate-400 mt-3">
                👈 Move dividing bubble handle left/right to compare pixel changes • Hover inside canvas grid frame to engage 250% deep lens zoom
              </div>
            </div>

          </section>
        </div>
      )}

      {/* FOOTER */}
      <footer className="bg-white border-t border-slate-100 py-12 px-8 mt-auto w-full">
        <div className="max-w-5xl mx-auto space-y-12">
          <section className="grid grid-cols-1 md:grid-cols-3 gap-8 text-center sm:text-left">
            <article className="space-y-3 flex flex-col items-center sm:items-start">
              <div className="text-teal-500 bg-teal-50 w-fit p-3.5 rounded-2xl"><svg xmlns="http://www.w3.org/2000/svg" width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><path d="m13 2-2 10h9L11 22l2-10H4Z"/></svg></div>
              <h3 className="font-bold text-slate-800 text-sm tracking-wide">Instant Batch Conversion</h3>
              <p className="text-xs text-slate-400 leading-relaxed font-medium">Upload hundreds of image files at once. ImageToPDFNow applies lightning-fast lexical automatic arrangement sequences.</p>
            </article>
            <article className="space-y-3 flex flex-col items-center sm:items-start">
              <div className="text-teal-500 bg-teal-50 w-fit p-3.5 rounded-2xl"><svg xmlns="http://www.w3.org/2000/svg" width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><path d="M12 22c5.523 0 10-4.477 10-10S17.523 2 12 2 2 6.477 2 12s4.477 10 10 10z"/><path d="m14.5 9.5-5 5"/><path d="m9.5 9.5 5 5"/></svg></div>
              <h3 className="font-bold text-slate-800 text-sm tracking-wide">Advanced Canvas Fitting</h3>
              <p className="text-xs text-slate-400 leading-relaxed font-medium">Avoid oversized page bugs. Our engines scale boundaries intelligently to standard corporate viewports.</p>
            </article>
            <article className="space-y-3 flex flex-col items-center sm:items-start">
              <div className="text-teal-500 bg-teal-50 w-fit p-3.5 rounded-2xl"><svg xmlns="http://www.w3.org/2000/svg" width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/></svg></div>
              <h3 className="font-bold text-slate-800 text-sm tracking-wide">Secure Client-Side Processing</h3>
              <p className="text-xs text-slate-400 leading-relaxed font-medium">Your data security is prioritized. No data packets ever upload to external cloud servers. Conversion stays inside your RAM.</p>
            </article>
          </section>

          <hr className="border-slate-100" />

          {/* BRANDED SIGNATURE FOOTER INTEGRATION - CAVEAT FONT */}
          <div className="flex flex-col items-center justify-center gap-3 pt-2">
            <style>
              {`@import url('https://fonts.googleapis.com/css2?family=Caveat:wght@700&display=swap');`}
            </style>
            <div className="text-[13px] font-medium text-slate-400 flex items-center gap-1.5">
              Made by{" "}
              <a
                href="https://minaboktor.com"
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-0.5 transition-transform duration-300 hover:translate-x-1 decoration-transparent"
                style={{ fontFamily: "'Caveat', cursive", fontSize: '1.5rem', letterSpacing: '0.5px' }}
              >
                <span className="bg-gradient-to-r from-teal-600 via-emerald-400 to-teal-500 bg-clip-text text-transparent pb-1">
                  Mina Boktor
                </span> 
              </a>
            </div>
            
            <div className="text-center text-[11px] font-bold text-slate-300">
              {"©"} {new Date().getFullYear()} ImageToPDFNow. All rights reserved. Secure open-source document utilities.
            </div>
          </div>

        </div>
      </footer>
    </div>
  );
}