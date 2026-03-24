'use client'

import { useEffect } from 'react'
import { supabase } from '@/lib/supabase'

export default function Home() {
  useEffect(() => {
    const test = async () => {
      const { data, error } = await supabase.from('posts').select('*')

      console.log('data:', data)
      console.log('error:', error)
    }

    test()
  }, [])

  return <div>Supabase 연결 테스트</div>
}