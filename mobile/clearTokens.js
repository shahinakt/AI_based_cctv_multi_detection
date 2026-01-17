// Quick script to clear all tokens - paste in mobile console or create a button
import AsyncStorage from '@react-native-async-storage/async-storage';

AsyncStorage.multiRemove([
  'adminToken',
  'securityToken', 
  'viewerToken',
  'userToken',
  'user'
]).then(() => {
  console.log('✅ All tokens cleared - please login again');
}).catch((e) => {
  console.error('Error clearing tokens:', e);
});
