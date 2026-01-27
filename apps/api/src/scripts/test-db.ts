import { disposeClient, query } from '../db/firebird';

const run = async (): Promise<void> => {
  try {
    const result = await query<{ now: Date }>(
      'SELECT CURRENT_TIMESTAMP as now FROM RDB$DATABASE'
    );

    // eslint-disable-next-line no-console
    console.log('Firebird connection successful:', result[0]);
  } catch (error) {
    // eslint-disable-next-line no-console
    console.error('Firebird connection failed', error);
    process.exitCode = 1;
  } finally {
    await disposeClient();
  }
};

void run();
