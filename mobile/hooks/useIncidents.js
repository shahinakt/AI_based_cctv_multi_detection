// hooks/useIncidents.js
import { useState, useEffect, useCallback } from 'react';
import { getIncidents } from '../services/api';
import { Alert } from 'react-native';

const useIncidents = () => {
  const [incidents, setIncidents] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [refreshing, setRefreshing] = useState(false);

  const fetchIncidents = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const response = await getIncidents();
      if (response.success) {
        setIncidents(response.data);
      } else {
        setError(response.message || 'Failed to fetch incidents.');
        Alert.alert('Error', response.message || 'Failed to fetch incidents.');
      }
    } catch (err) {
      console.error('Error fetching incidents:', err);
      setError('An unexpected error occurred while fetching incidents.');
      Alert.alert('Error', 'An unexpected error occurred while fetching incidents.');
    } finally {
      setLoading(false);
    }
  }, []);

  const refreshIncidents = useCallback(async () => {
    setRefreshing(true);
    await fetchIncidents();
    setRefreshing(false);
  }, [fetchIncidents]);

  useEffect(() => {
    fetchIncidents();
  }, [fetchIncidents]);

  return { incidents, loading, error, refreshIncidents, refreshing };
};

export default useIncidents;