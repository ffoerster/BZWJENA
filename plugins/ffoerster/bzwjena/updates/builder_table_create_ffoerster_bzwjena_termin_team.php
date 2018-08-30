<?php namespace ffoerster\BZWJena\Updates;

use Schema;
use October\Rain\Database\Updates\Migration;

class BuilderTableCreateFfoersterBzwjenaTerminTeam extends Migration
{
    public function up()
    {
        Schema::create('ffoerster_bzwjena_termin_team', function($table)
        {
            $table->engine = 'InnoDB';
            $table->integer('termin_id');
            $table->integer('team_id');
            $table->primary(['termin_id','team_id']);
        });
    }
    
    public function down()
    {
        Schema::dropIfExists('ffoerster_bzwjena_termin_team');
    }
}
