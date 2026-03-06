# NewsLaw

A modern Next.js boilerplate with tRPC, Supabase, and shadcn/ui components.

## 🚀 Tech Stack

- **Framework**: Next.js 14+ with App Router
- **Language**: TypeScript
- **API**: tRPC for type-safe APIs
- **Database**: No database (as per requirements)
- **Storage**: Supabase S3 buckets
- **Styling**: Tailwind CSS + shadcn/ui components
- **State Management**: React Query (via tRPC)
- **Package Manager**: pnpm
- **Deployment**: Railway

## 📁 Project Structure

```
newsclaw/
├── src/
│   ├── app/                 # Next.js App Router
│   ├── components/          # React components
│   │   └── ui/             # shadcn/ui components
│   ├── lib/                # Utilities
│   └── utils/              # tRPC client setup
├── packages/
│   └── trpc/               # tRPC server package
│       └── src/
│           ├── routers/    # tRPC routers
│           └── trpc.ts     # tRPC setup
└── railway.json           # Railway deployment config
```

## 🏃‍♂️ Getting Started

1. **Clone the repository**:
   ```bash
   git clone https://github.com/yonghyun-jin/newsclaw.git
   cd newsclaw
   ```

2. **Install dependencies**:
   ```bash
   pnpm install
   ```

3. **Set up environment variables**:
   ```bash
   cp .env.example .env.local
   ```
   
   Fill in your Supabase credentials:
   ```env
   NEXT_PUBLIC_SUPABASE_URL=your_supabase_url
   NEXT_PUBLIC_SUPABASE_ANON_KEY=your_supabase_anon_key
   ```

4. **Start the development server**:
   ```bash
   pnpm dev
   ```

5. **Open [http://localhost:3000](http://localhost:3000)** in your browser.

## 📦 Features

- ✅ **tRPC**: Type-safe API layer with React Query integration
- ✅ **Supabase Storage**: S3-compatible file storage
- ✅ **shadcn/ui**: Beautiful, accessible UI components
- ✅ **Tailwind CSS**: Utility-first CSS framework
- ✅ **TypeScript**: Full type safety
- ✅ **Railway Deploy**: One-click deployment
- ✅ **Monorepo Structure**: Organized with pnpm workspaces

## 🔧 tRPC Usage

The tRPC API is set up in the `packages/trpc` directory. Example usage:

```tsx
// Client-side usage
import { trpc } from '@/utils/trpc';

function MyComponent() {
  const hello = trpc.example.hello.useQuery({ name: 'World' });
  return <div>{hello.data?.greeting}</div>;
}
```

## 📤 Supabase Storage

Use the built-in storage helpers:

```tsx
import { uploadFile, getPublicUrl } from '@/lib/supabase';

// Upload a file
const data = await uploadFile(file, 'bucket-name', 'path/to/file');

// Get public URL
const url = getPublicUrl('bucket-name', 'path/to/file');
```

## 🚀 Deployment

### Railway

1. Connect your GitHub repository to Railway
2. Set environment variables in Railway dashboard
3. Deploy automatically on push to main branch

The `railway.json` configuration is already included.

## 🛠 Development

### Adding new tRPC routes

1. Create a new router in `packages/trpc/src/routers/`
2. Add it to the main router in `packages/trpc/src/routers/_app.ts`

### Adding shadcn/ui components

```bash
pnpm dlx shadcn@latest add [component-name]
```

## 📝 Scripts

- `pnpm dev` - Start development server
- `pnpm build` - Build for production
- `pnpm start` - Start production server
- `pnpm lint` - Run ESLint

## 🤝 Contributing

1. Fork the repository
2. Create a feature branch
3. Make your changes
4. Submit a pull request

## 📄 License

MIT License - see LICENSE file for details.