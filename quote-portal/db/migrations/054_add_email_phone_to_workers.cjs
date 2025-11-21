/**
 * Migration: Add email and phone columns to mes.workers table
 * Frontend collects these fields but they don't exist in DB
 */

exports.up = function(knex) {
  return knex.schema.withSchema('mes').table('workers', function(table) {
    table.string('email', 255);
    table.string('phone', 50);
  });
};

exports.down = function(knex) {
  return knex.schema.withSchema('mes').table('workers', function(table) {
    table.dropColumn('email');
    table.dropColumn('phone');
  });
};
