import React, { useRef, useEffect, useState } from 'react';
import { WS_BASE_URL, API_BASE_URL } from '../utils/constants';

function FeedCard({ camera, latestIncident }) {
  const canvasRef = useRef(null);
  const imgRef = useRef(null);
  const [error, setError] = useState(null);
  const [loading, setLoading] = useState(true);

  
  const drawBoundingBoxes = (boxes, canvas, img) => {
    const ctx = canvas.getContext('2d');
    ctx.clearRect(0, 0, canvas.width, canvas.height); 

    if (!img || img.naturalWidth === 0 || img.naturalHeight === 0) {
      return; 
    }

    
    canvas.width = img.offsetWidth;
    canvas.height = img.offsetHeight;

    boxes.forEach(box => {
    
      const [x_min, y_min, x_max, y_max, label, confidence] = box;

      const x = x_min * canvas.width;
      const y = y_min * canvas.height;
      const width = (x_max - x_min) * canvas.width;
      const height = (y_max - y_min) * canvas.height;

      ctx.beginPath();
      ctx.rect(x, y, width, height);
      ctx.lineWidth = 2;
      ctx.strokeStyle = 'red';
      ctx.fillStyle = 'rgba(255, 0, 0, 0.2)';
      ctx.stroke();
      ctx.fillRect(x, y, width, height);

      ctx.fillStyle = 'white';
      ctx.font = '12px Arial';
      ctx.fillText(`${label} (${(confidence * 100).toFixed(1)}%)`, x + 5, y + 15);
    });
  };

  useEffect(() => {
    const img = imgRef.current;
    const canvas = canvasRef.current;

    if (!img || !canvas) return;

    const handleImageLoad = () => {
      setLoading(false);
      
      if (latestIncident && latestIncident.camera_id === camera.id && latestIncident.bounding_boxes) {
        drawBoundingBoxes(latestIncident.bounding_boxes, canvas, img);
      }
    };

    img.addEventListener('load', handleImageLoad);

   
    if (img.complete) {
      handleImageLoad();
    }

    return () => {
      img.removeEventListener('load', handleImageLoad);
    };
  }, [camera.id, latestIncident]); 

  useEffect(() => {
    const img = imgRef.current;
    const canvas = canvasRef.current;

    if (latestIncident && latestIncident.camera_id === camera.id && latestIncident.bounding_boxes && img && img.complete) {
      drawBoundingBoxes(latestIncident.bounding_boxes, canvas, img);
    } else if (canvas) {
      
      const ctx = canvas.getContext('2d');
      ctx.clearRect(0, 0, canvas.width, canvas.height);
    }
  }, [latestIncident, camera.id]);


  const handleImageError = () => {
    setError('Failed to load stream. Check camera status or URL.');
    setLoading(false);
  };

  
  let streamUrl;
  if (camera.stream_url !== undefined && camera.stream_url !== null && camera.stream_url !== '') {
    // If it's a full URL or data uri or absolute path, use as-is
    if (typeof camera.stream_url === 'string' && (
      camera.stream_url.startsWith('http') ||
      camera.stream_url.startsWith('data:') ||
      camera.stream_url.startsWith('/'))
    ) {
      streamUrl = camera.stream_url;
    } else {
      // Treat numeric values like 0 or short identifiers as camera feed identifiers
      // If it's a numeric webcam index, prefer the backend MJPEG preview endpoint
      if (String(camera.stream_url).match(/^\d+$/)) {
        streamUrl = `${API_BASE_URL}/api/v1/webcam/mjpeg`;
      } else {
        streamUrl = `${WS_BASE_URL.replace('ws', 'http')}/camera_feed/${camera.stream_url}`;
      }
    }
  } else {
    streamUrl = `${WS_BASE_URL.replace('ws', 'http')}/camera_feed/${camera.id}`;
  }
  

  return (
    <div className="bg-surface rounded-lg shadow-lg overflow-hidden relative">
      <h3 className="text-xl font-semibold text-text p-4 border-b border-gray-600">
        {camera.name} ({camera.location})
      </h3>
      <div className="relative w-full h-64 bg-gray-800 flex items-center justify-center">
        {loading && <div className="text-text-secondary">Loading stream...</div>}
        {error && <div className="text-accent p-4">{error}</div>}
        {!error && (
          <>
            <img
              ref={imgRef}
              src={streamUrl}
              alt={`Live feed from ${camera.name}`}
              className={`w-full h-full object-contain ${loading ? 'hidden' : 'block'}`}
              onError={handleImageError}
              onLoad={() => setLoading(false)}
            />
            <canvas
              ref={canvasRef}
              className="absolute top-0 left-0 w-full h-full"
            ></canvas>
          </>
        )}
      </div>
      <div className="p-4 text-text-secondary text-sm">
        <p>Status: <span className={`font-medium ${
          (camera.streaming_status || camera.status) === 'active' ? 'text-green-400' :
          (camera.streaming_status || camera.status) === 'inactive' ? 'text-red-400' :
          'text-yellow-400'
        }`}>{camera.streaming_status || camera.status || 'unknown'}</span></p>
        {latestIncident && latestIncident.camera_id === camera.id && (
          <p className="text-accent mt-2">
            Latest Incident: {latestIncident.type} at {new Date(latestIncident.timestamp).toLocaleTimeString()}
          </p>
        )}
      </div>
    </div>
  );
}

export default FeedCard;