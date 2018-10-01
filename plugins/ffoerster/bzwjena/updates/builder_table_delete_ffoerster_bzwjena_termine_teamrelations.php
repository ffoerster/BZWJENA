<?php namespace ffoerster\BZWJena\Updates;

use Schema;
use October\Rain\Database\Updates\Migration;

class BuilderTableDeleteFfoersterBzwjenaTermineTeamrelations extends Migration
{
    public function up()
    {
        Schema::dropIfExists('ffoerster_bzwjena_termine_teamrelations');
    }
    
    public function down()
    {
        Schema::create('ffoerster_bzwjena_termine_teamrelations', function($table)
        {
            $table->engine = 'InnoDB';
            $table->integer('termin_id');
            $table->integer('team_id');
        });
    }
}
