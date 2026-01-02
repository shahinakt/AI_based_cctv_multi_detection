// components/BottomNavigation.jsx
import React from 'react';
import { View, TouchableOpacity, Text } from 'react-native';
import { useTailwind } from 'tailwind-rn';

const BottomNavigation = ({ navigation, activeRoute, role = 'viewer' }) => {
  const tailwind = useTailwind();

  const getNavItems = () => {
    if (role === 'admin') {
      return [
        { name: 'Home', route: 'AdminDashboard' },
        { name: 'Incidents', route: 'IncidentList' },
        { name: 'Security', route: 'GrantAccess' },
        { name: 'Profile', route: 'AdminProfile' },
      ];
    } else if (role === 'security') {
      return [
        { name: 'Home', route: 'SecurityDashboard' },
        { name: 'Incidents', route: 'IncidentList' },
        { name: 'Profile', route: 'Profile' },
      ];
    } else {
      return [
        { name: 'Home', route: 'ViewerDashboard' },
        { name: 'Incidents', route: 'IncidentList' },
        { name: 'Report', route: 'Acknowledgement' },
        { name: 'Profile', route: 'Profile' },
      ];
    }
  };

  const navItems = getNavItems();

  return (
    <View style={[tailwind('flex-row bg-white border-t border-gray-300'), { paddingBottom: 10, paddingTop: 8 }]}>
      {navItems.map((item, index) => {
        const isActive = activeRoute === item.route;
        return (
          <TouchableOpacity
            key={index}
            style={tailwind('flex-1 items-center justify-center')}
            onPress={() => navigation.navigate(item.route)}
          >
            <Text
              style={[
                tailwind('text-sm'),
                { color: isActive ? '#3B82F6' : '#6B7280', fontWeight: isActive ? 'bold' : 'normal' }
              ]}
            >
              {item.name}
            </Text>
          </TouchableOpacity>
        );
      })}
    </View>
  );
};

export default BottomNavigation;
