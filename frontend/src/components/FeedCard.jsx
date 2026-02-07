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

  
  // Detect if this is a webcam camera (stream_url is a numeric device ID like "0", "1", "2")
  const isWebcam = camera.stream_url && String(camera.stream_url).match(/^\d+$/);

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
      // For webcam indices or identifiers, use backend camera_feed endpoint
      // This proxies from AI Worker without opening webcam again
      streamUrl = `${API_BASE_URL}/camera_feed/${camera.id}`;
    }
  } else {
    streamUrl = `${API_BASE_URL}/camera_feed/${camera.id}`;
  }
  
  

  return (
    <div className="bg-surface rounded-lg shadow-lg overflow-hidden relative">
      <h3 className="text-xl font-semibold text-text p-4 border-b border-gray-600">
        {camera.name} ({camera.location})
      </h3>
      <div className="relative w-full h-64 bg-gray-800 flex items-center justify-center">
        {isWebcam ? (
          // Webcam camera - show processing indicator (AI Worker has exclusive access)
          <div className="w-full h-full flex flex-col items-center justify-center bg-gradient-to-br from-gray-900 to-gray-800 backdrop-blur-md">
            <div className="relative w-48 h-48 mb-4">
              {/* Animated radar/pulse effect */}
              <div className="absolute inset-0 rounded-full bg-primary opacity-20 animate-ping"></div>
              <div className="absolute inset-0 rounded-full bg-primary opacity-30 animate-pulse"></div>
              <div className="absolute inset-0 flex items-center justify-center">
                <svg className="w-24 h-24 text-primary" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 10l4.553-2.276A1 1 0 0121 8.618v6.764a1 1 0 01-1.447.894L15 14M5 18h8a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v8a2 2 0 002 2z" />
                </svg>
              </div>
            </div>
            <div className="text-center px-4">
              <div className="flex items-center justify-center space-x-2 mb-2">
                <div className="w-2 h-2 bg-green-400 rounded-full animate-pulse"></div>
                <p className="text-primary font-semibold text-lg">AI Processing Active</p>
              </div>
              <p className="text-text-secondary text-sm mb-1">
                🎥 Webcam Device {camera.stream_url}
              </p>
              <p className="text-gray-400 text-xs">
                Real-time object detection & incident analysis in progress
              </p>
              <div className="mt-3 flex items-center justify-center space-x-1 text-xs text-gray-500">
                <span className="inline-block w-1 h-1 bg-gray-500 rounded-full animate-bounce" style={{animationDelay: '0s'}}></span>
                <span className="inline-block w-1 h-1 bg-gray-500 rounded-full animate-bounce" style={{animationDelay: '0.2s'}}></span>
                <span className="inline-block w-1 h-1 bg-gray-500 rounded-full animate-bounce" style={{animationDelay: '0.4s'}}></span>
              </div>
            </div>
          </div>
        ) : (
          // Network camera - try to load stream
          <>
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