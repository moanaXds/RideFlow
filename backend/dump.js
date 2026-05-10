const db = require('./config/db');

async function dumpSchema() {
  try {
    const [tables] = await db.query('SHOW TABLES');
    const tableKey = Object.keys(tables[0])[0];
    
    let schema = '';
    
    for (let row of tables) {
      const tableName = row[tableKey];
      const [createTable] = await db.query(`SHOW CREATE TABLE ${tableName}`);
      schema += createTable[0]['Create Table'] + ';\n\n';
      
      const [triggers] = await db.query(`SHOW TRIGGERS LIKE '${tableName}'`);
      for (let trigger of triggers) {
        const [createTrigger] = await db.query(`SHOW CREATE TRIGGER ${trigger.Trigger}`);
        schema += 'DELIMITER //\n' + createTrigger[0]['SQL Original Statement'] + '\n//\nDELIMITER ;\n\n';
      }
    }
    
    const [procedures] = await db.query("SHOW PROCEDURE STATUS WHERE Db = 'rideflow'");
    for (let proc of procedures) {
      const [createProc] = await db.query(`SHOW CREATE PROCEDURE ${proc.Name}`);
      schema += 'DELIMITER //\n' + createProc[0]['Create Procedure'] + '\n//\nDELIMITER ;\n\n';
    }

    console.log(schema);
    process.exit(0);
  } catch (err) {
    console.error(err);
    process.exit(1);
  }
}

dumpSchema();
