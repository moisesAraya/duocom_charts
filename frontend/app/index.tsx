import { useEffect } from 'react';
import { router } from 'expo-router';

export default function IndexScreen() {
  useEffect(() => {
    router.replace('/splash');
  }, []);

  return null;
}
