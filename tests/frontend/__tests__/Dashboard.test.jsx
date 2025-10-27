// tests/frontend/__tests__/Dashboard.test.jsx
import React from 'react';
import { render, screen, waitFor } from '@testing-library/react';
import '@testing-library/jest-dom';
import Dashboard from '../../../frontend/src/components/Dashboard'; // Assuming this path
import { getCameraFeeds, getIncidents } from '../../../frontend/src/services/api'; // Assuming this path

// Mock API services
jest.mock('../../../frontend/src/services/api', () => ({
  getCameraFeeds: jest.fn(),
  getIncidents: jest.fn(),
}));

// Mock child components
jest.mock('../../../frontend/src/components/FeedCard', () => ({ camera }) => (
  <div data-testid={`feed-card-${camera.id}`}>{camera.name}</div>
));
jest.mock('../../../frontend/src/components/IncidentCard', () => ({ incident }) => (
  <div data-testid={`incident-card-${incident.id}`}>{incident.description}</div>
));

describe('Dashboard Component', () => {
  beforeEach(() => {
    getCameraFeeds.mockClear();
    getIncidents.mockClear();
  });

  it('renders loading state initially', () => {
    getCameraFeeds.mockReturnValue(new Promise(() => {})); // Never resolve
    getIncidents.mockReturnValue(new Promise(() => {})); // Never resolve

    render(<Dashboard />);
    expect(screen.getByText(/loading camera feeds.../i)).toBeInTheDocument();
    expect(screen.getByText(/loading incidents.../i)).toBeInTheDocument();
  });

  it('renders camera feeds and incidents when data is fetched successfully', async () => {
    const mockFeeds = [
      { id: 1, name: 'Cam A', stream_url: 'http://stream.a' },
      { id: 2, name: 'Cam B', stream_url: 'http://stream.b' },
    ];
    const mockIncidents = [
      { id: 101, description: 'Theft detected', type: 'theft', status: 'pending' },
      { id: 102, description: 'Abuse detected', type: 'abuse', status: 'acknowledged' },
    ];

    getCameraFeeds.mockResolvedValueOnce({ success: true, data: mockFeeds });
    getIncidents.mockResolvedValueOnce({ success: true, data: mockIncidents });

    render(<Dashboard />);

    await waitFor(() => {
      expect(screen.getByText('Live Camera Feeds')).toBeInTheDocument();
      expect(screen.getByText('Cam A')).toBeInTheDocument();
      expect(screen.getByText('Cam B')).toBeInTheDocument();
      expect(screen.getByText('Recent Incidents')).toBeInTheDocument();
      expect(screen.getByText('Theft detected')).toBeInTheDocument();
      expect(screen.getByText('Abuse detected')).toBeInTheDocument();
    });
  });

  it('renders error message if camera feeds fail to load', async () => {
    getCameraFeeds.mockResolvedValueOnce({ success: false, message: 'Failed to fetch feeds' });
    getIncidents.mockResolvedValueOnce({ success: true, data: [] }); // Incidents load fine

    render(<Dashboard />);

    await waitFor(() => {
      expect(screen.getByText(/error loading camera feeds: failed to fetch feeds/i)).toBeInTheDocument();
      expect(screen.queryByText('Live Camera Feeds')).not.toBeInTheDocument(); // Section might not render
    });
  });

  it('renders error message if incidents fail to load', async () => {
    getCameraFeeds.mockResolvedValueOnce({ success: true, data: [] });
    getIncidents.mockResolvedValueOnce({ success: false, message: 'Failed to fetch incidents' });

    render(<Dashboard />);

    await waitFor(() => {
      expect(screen.getByText(/error loading incidents: failed to fetch incidents/i)).toBeInTheDocument();
      expect(screen.queryByText('Recent Incidents')).not.toBeInTheDocument();
    });
  });

  it('renders "No feeds available" when no camera feeds are returned', async () => {
    getCameraFeeds.mockResolvedValueOnce({ success: true, data: [] });
    getIncidents.mockResolvedValueOnce({ success: true, data: [] });

    render(<Dashboard />);

    await waitFor(() => {
      expect(screen.getByText(/no camera feeds available/i)).toBeInTheDocument();
    });
  });

  it('renders "No incidents to display" when no incidents are returned', async () => {
    getCameraFeeds.mockResolvedValueOnce({ success: true, data: [] });
    getIncidents.mockResolvedValueOnce({ success: true, data: [] });

    render(<Dashboard />);

    await waitFor(() => {
      expect(screen.getByText(/no incidents to display/i)).toBeInTheDocument();
    });
  });
});