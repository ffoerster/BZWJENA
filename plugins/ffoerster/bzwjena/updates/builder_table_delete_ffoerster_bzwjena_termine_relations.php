<?php namespace ffoerster\BZWJena\Updates;

use Schema;
use October\Rain\Database\Updates\Migration;

class BuilderTableDeleteFfoersterBzwjenaTermineRelations extends Migration
{
    public function up()
    {
        Schema::dropIfExists('ffoerster_bzwjena_termine_relations');
    }
    
    public function down()
    {
        Schema::create('ffoerster_bzwjena_termine_relations', function($table)
        {
            $table->engine = 'InnoDB';
            $table->integer('termin_id');
            $table->integer('angebot_id');
            $table->integer('team_id');
        });
    }
}
