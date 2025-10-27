import React from 'react';
import { render, screen, waitFor } from '@testing-library/react';
import '@testing-library/jest-dom';
import FeedCard from './FeedCard';

// Mock the constants to control stream URL
jest.mock('../utils/constants', () => ({
  WS_BASE_URL: 'ws://localhost:8000',
}));

// Mock HTMLImageElement.prototype.naturalWidth and naturalHeight for canvas drawing tests
Object.defineProperty(global.Image.prototype, 'naturalWidth', {
  get: function() { return this.width || 100; } // Default to 100 if not set
});
Object.defineProperty(global.Image.prototype, 'naturalHeight', {
  get: function() { return this.height || 100; } // Default to 100 if not set
});

describe('FeedCard Component', () => {
  const mockCamera = {
    id: 'cam1',
    name: 'Main Entrance',
    location: 'Building A',
    stream_url: 'http://localhost:8000/camera_feed/cam1',
    status: 'active',
  };

  const mockIncident = {
    id: 'inc1',
    type: 'Theft',
    camera_id: 'cam1',
    timestamp: new Date().toISOString(),
    bounding_boxes: [
      [0.1, 0.2, 0.3, 0.4, 'person', 0.95],
      [0.5, 0.6, 0.7, 0.8, 'bag', 0.88],
    ],
  };

  test('renders camera name and location', () => {
    render(<FeedCard camera={mockCamera} latestIncident={null} />);
    expect(screen.getByText('Main Entrance (Building A)')).toBeInTheDocument();
  });

  test('renders camera status', () => {
    render(<FeedCard camera={mockCamera} latestIncident={null} />);
    expect(screen.getByText('Status:')).toBeInTheDocument();
    expect(screen.getByText('active')).toBeInTheDocument();
  });

  test('displays loading message initially', () => {
    render(<FeedCard camera={mockCamera} latestIncident={null} />);
    expect(screen.getByText('Loading stream...')).toBeInTheDocument();
  });

  test('displays image after loading', async () => {
    render(<FeedCard camera={mockCamera} latestIncident={null} />);
    const img = screen.getByAltText(/live feed from main entrance/i);

    // Simulate image load
    fireEvent.load(img);

    await waitFor(() => {
      expect(screen.queryByText('Loading stream...')).not.toBeInTheDocument();
      expect(img).toBeVisible();
    });
  });

  test('displays error message if image fails to load', async () => {
    render(<FeedCard camera={mockCamera} latestIncident={null} />);
    const img = screen.getByAltText(/live feed from main entrance/i);

    fireEvent.error(img);

    await waitFor(() => {
      expect(screen.queryByText('Loading stream...')).not.toBeInTheDocument();
      expect(screen.getByText('Failed to load stream. Check camera status or URL.')).toBeInTheDocument();
    });
  });

  test('displays latest incident information if it matches camera ID', () => {
    render(<FeedCard camera={mockCamera} latestIncident={mockIncident} />);
    expect(screen.getByText(/latest incident: theft/i)).toBeInTheDocument();
  });

  test('does not display incident information if it does not match camera ID', () => {
    const otherIncident = { ...mockIncident, camera_id: 'cam2' };
    render(<FeedCard camera={mockCamera} latestIncident={otherIncident} />);
    expect(screen.queryByText(/latest incident:/i)).not.toBeInTheDocument();
  });

  test('draws bounding boxes on canvas when incident with boxes is present', async () => {
    // Mock canvas context methods
    const mockContext = {
      clearRect: jest.fn(),
      beginPath: jest.fn(),
      rect: jest.fn(),
      stroke: jest.fn(),
      fill: jest.fn(),
      fillText: jest.fn(),
      set lineWidth(val) {},
      set strokeStyle(val) {},
      set fillStyle(val) {},
      set font(val) {},
    };
    HTMLCanvasElement.prototype.getContext = jest.fn(() => mockContext);

    render(<FeedCard camera={mockCamera} latestIncident={mockIncident} />);
    const img = screen.getByAltText(/live feed from main entrance/i);

    // Simulate image load
    fireEvent.load(img);

    await waitFor(() => {
      expect(mockContext.clearRect).toHaveBeenCalled();
      expect(mockContext.beginPath).toHaveBeenCalledTimes(2); // For two bounding boxes
      expect(mockContext.rect).toHaveBeenCalledTimes(2);
      expect(mockContext.stroke).toHaveBeenCalledTimes(2);
      expect(mockContext.fill).toHaveBeenCalledTimes(2);
      expect(mockContext.fillText).toHaveBeenCalledTimes(2);
      expect(mockContext.fillText).toHaveBeenCalledWith(expect.stringContaining('person'), expect.any(Number), expect.any(Number));
      expect(mockContext.fillText).toHaveBeenCalledWith(expect.stringContaining('bag'), expect.any(Number), expect.any(Number));
    });
  });

  test('clears canvas if incident is not for this camera', async () => {
    const mockContext = {
      clearRect: jest.fn(),
      beginPath: jest.fn(),
      rect: jest.fn(),
      stroke: jest.fn(),
      fill: jest.fn(),
      fillText: jest.fn(),
      set lineWidth(val) {},
      set strokeStyle(val) {},
      set fillStyle(val) {},
      set font(val) {},
    };
    HTMLCanvasElement.prototype.getContext = jest.fn(() => mockContext);

    const otherIncident = { ...mockIncident, camera_id: 'cam2' };
    render(<FeedCard camera={mockCamera} latestIncident={otherIncident} />);
    const img = screen.getByAltText(/live feed from main entrance/i);

    fireEvent.load(img);

    await waitFor(() => {
      // Canvas should be cleared, but no boxes drawn
      expect(mockContext.clearRect).toHaveBeenCalled();
      expect(mockContext.beginPath).not.toHaveBeenCalled();
    });
  });
});