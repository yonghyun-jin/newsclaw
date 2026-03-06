'use client';

import { trpc } from './_trpc/client';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { useState } from 'react';

export default function Home() {
  const [name, setName] = useState('');
  const hello = trpc.example.hello.useQuery({ name });
  const items = trpc.example.getAll.useQuery();

  return (
    <main className="container mx-auto px-4 py-8">
      <div className="max-w-4xl mx-auto space-y-8">
        <div className="text-center space-y-4">
          <h1 className="text-4xl font-bold">NewsLaw Boilerplate</h1>
          <p className="text-xl text-muted-foreground">
            Next.js + tRPC + Supabase + shadcn/ui + Railway Deploy
          </p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          <Card>
            <CardHeader>
              <CardTitle>tRPC Demo</CardTitle>
              <CardDescription>Test the tRPC connection</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div>
                <input
                  type="text"
                  placeholder="Enter your name"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  className="w-full px-3 py-2 border rounded-md"
                />
              </div>
              <div className="p-3 bg-muted rounded-md">
                {hello.data ? hello.data.greeting : 'Loading...'}
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Data Fetching</CardTitle>
              <CardDescription>Example items from tRPC</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="space-y-2">
                {items.data?.map((item) => (
                  <div key={item.id} className="p-2 bg-muted rounded-md">
                    {item.text}
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        </div>

        <Card>
          <CardHeader>
            <CardTitle>Tech Stack</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
              {[
                'Next.js 14+',
                'TypeScript',
                'tRPC',
                'React Query',
                'Tailwind CSS',
                'shadcn/ui',
                'Supabase',
                'Railway Deploy',
                'pnpm',
              ].map((tech) => (
                <div key={tech} className="p-3 text-center bg-muted rounded-md">
                  {tech}
                </div>
              ))}
            </div>
          </CardContent>
        </Card>

        <div className="text-center space-y-4">
          <Button size="lg">Get Started</Button>
          <p className="text-sm text-muted-foreground">
            Edit <code>src/app/page.tsx</code> to start building your app
          </p>
        </div>
      </div>
    </main>
  );
}