import { defineConfig } from '@mikro-orm/postgresql';
import { Migrator } from '@mikro-orm/migrations';


try {
  process.loadEnvFile();
} catch {
  
}

export default defineConfig({
  clientUrl: process.env.DATABASE_URL,
  extensions: [Migrator],
  discovery: { warnWhenNoEntities: false },
});